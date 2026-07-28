import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentProviderOperations1786900000000 implements MigrationInterface {
  name = 'AddPaymentProviderOperations1786900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "project_payments"
      ADD COLUMN "providerPreferenceId" varchar(255),
      ADD COLUMN "checkoutUrl" varchar(1000),
      ADD COLUMN "providerStatus" varchar(120),
      ADD COLUMN "externalReference" varchar(255)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_project_payments_provider_preference"
      ON "project_payments" ("provider", "providerPreferenceId")
      WHERE "providerPreferenceId" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE TABLE "payment_refunds" (
        "id" uuid NOT NULL,
        "paymentId" uuid NOT NULL,
        "amount" numeric(19,4) NOT NULL,
        "currency" varchar(3) NOT NULL,
        "providerRefundId" varchar(255),
        "status" varchar NOT NULL,
        "reason" varchar(500) NOT NULL,
        "requestedBy" uuid NOT NULL,
        "idempotencyKey" varchar(160) NOT NULL,
        "createdAt" timestamptz NOT NULL,
        "updatedAt" timestamptz NOT NULL,
        CONSTRAINT "PK_payment_refunds" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_refunds_idempotency" UNIQUE ("idempotencyKey"),
        CONSTRAINT "CHK_payment_refunds_amount" CHECK ("amount" > 0),
        CONSTRAINT "FK_payment_refunds_payment" FOREIGN KEY ("paymentId") REFERENCES "project_payments"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_payment_refunds_requested_by" FOREIGN KEY ("requestedBy") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_refunds_payment" ON "payment_refunds" ("paymentId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_refunds_status" ON "payment_refunds" ("status")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "payment_refunds"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_project_payments_provider_preference"`,
    );
    await queryRunner.query(`
      ALTER TABLE "project_payments"
      DROP COLUMN "externalReference",
      DROP COLUMN "providerStatus",
      DROP COLUMN "checkoutUrl",
      DROP COLUMN "providerPreferenceId"
    `);
  }
}
