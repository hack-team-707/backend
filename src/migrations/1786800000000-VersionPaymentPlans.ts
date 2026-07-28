import type { MigrationInterface, QueryRunner } from 'typeorm';

export class VersionPaymentPlans1786800000000 implements MigrationInterface {
  name = 'VersionPaymentPlans1786800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "projects"
      ALTER COLUMN "totalPrice" TYPE numeric(19,4)
      USING ROUND("totalPrice"::numeric, 4)
    `);
    await queryRunner.query(`
      ALTER TABLE "projects"
      ALTER COLUMN "currency" TYPE varchar(3)
      USING UPPER("currency")::varchar(3)
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_plan_installments"
      ADD COLUMN "allocationBasisPoints" integer
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "payment_plan_installments"
          GROUP BY "paymentPlanId"
          HAVING COUNT(*) > 10000
        ) THEN
          RAISE EXCEPTION 'A payment plan cannot contain more than 10000 installments';
        END IF;
      END $$
    `);
    await queryRunner.query(`
      WITH proportional AS (
        SELECT
          "id",
          "paymentPlanId",
          ROW_NUMBER() OVER (
            PARTITION BY "paymentPlanId" ORDER BY "sequence", "id"
          ) AS position,
          1 + FLOOR(
            "amount" / SUM("amount") OVER (PARTITION BY "paymentPlanId") *
            (10000 - COUNT(*) OVER (PARTITION BY "paymentPlanId"))
          )::integer AS base_points
        FROM "payment_plan_installments"
      ), allocated AS (
        SELECT
          "id",
          position,
          base_points,
          SUM(base_points) OVER (PARTITION BY "paymentPlanId") AS allocated_points
        FROM proportional
      )
      UPDATE "payment_plan_installments" AS installment
      SET "allocationBasisPoints" = allocated.base_points +
        CASE WHEN allocated.position = 1
          THEN 10000 - allocated.allocated_points
          ELSE 0
        END
      FROM allocated
      WHERE installment."id" = allocated."id"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_plan_installments"
      ALTER COLUMN "allocationBasisPoints" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_plan_installments"
      ADD CONSTRAINT "CHK_payment_plan_installments_basis_points"
      CHECK ("allocationBasisPoints" BETWEEN 1 AND 10000)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_plan_installments"
      DROP CONSTRAINT "CHK_payment_plan_installments_basis_points"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_plan_installments"
      DROP COLUMN "allocationBasisPoints"
    `);
    await queryRunner.query(`
      ALTER TABLE "projects"
      ALTER COLUMN "currency" TYPE varchar
    `);
    await queryRunner.query(`
      ALTER TABLE "projects"
      ALTER COLUMN "totalPrice" TYPE double precision
      USING "totalPrice"::double precision
    `);
  }
}
