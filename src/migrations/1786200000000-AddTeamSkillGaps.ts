import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTeamSkillGaps1786200000000 implements MigrationInterface {
  name = 'AddTeamSkillGaps1786200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "missingSkillIds" text array NOT NULL DEFAULT '{}'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "teams" DROP COLUMN IF EXISTS "missingSkillIds"',
    );
  }
}
