import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectLead1785600000000 implements MigrationInterface {
  name = 'AddProjectLead1785600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "leadSolverId" uuid`,
    );
    await queryRunner.query(
      `UPDATE "projects" SET "leadSolverId" = "solverIds"[1]::uuid WHERE "leadSolverId" IS NULL AND cardinality("solverIds") > 0`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projects" DROP COLUMN IF EXISTS "leadSolverId"`,
    );
  }
}
