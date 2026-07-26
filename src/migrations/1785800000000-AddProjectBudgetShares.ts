import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectBudgetShares1785800000000 implements MigrationInterface {
  name = 'AddProjectBudgetShares1785800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "projects"
        ADD COLUMN IF NOT EXISTS "totalPrice" double precision,
        ADD COLUMN IF NOT EXISTS "currency" varchar,
        ADD COLUMN IF NOT EXISTS "memberShares" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    await queryRunner.query(`
      UPDATE "projects" project
      SET
        "totalPrice" = proposal."price",
        "currency" = proposal."currency",
        "memberShares" = CASE
          WHEN COALESCE(project."leadSolverId"::text, project."solverIds"[1]) IS NULL
            THEN '{}'::jsonb
          ELSE jsonb_build_object(
            COALESCE(project."leadSolverId"::text, project."solverIds"[1]),
            100
          )
        END
      FROM "proposals" proposal
      WHERE proposal."id"::text = project."proposalId"
        AND project."totalPrice" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "project_invitations"
        ADD COLUMN IF NOT EXISTS "allocationPercent" double precision NOT NULL DEFAULT 20
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "project_invitations" DROP COLUMN IF EXISTS "allocationPercent"`,
    );
    await queryRunner.query(`
      ALTER TABLE "projects"
        DROP COLUMN IF EXISTS "memberShares",
        DROP COLUMN IF EXISTS "currency",
        DROP COLUMN IF EXISTS "totalPrice"
    `);
  }
}
