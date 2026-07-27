import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OneProposalPerTeam1786400000000 implements MigrationInterface {
  name = 'OneProposalPerTeam1786400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_proposals_team_unique" ON "proposals" ("teamId") WHERE "teamId" IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_proposals_team_unique"`);
  }
}
