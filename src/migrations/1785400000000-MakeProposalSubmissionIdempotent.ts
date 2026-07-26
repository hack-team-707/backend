import type { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeProposalSubmissionIdempotent1785400000000 implements MigrationInterface {
  name = 'MakeProposalSubmissionIdempotent1785400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_proposals_problem_submitter" ON "proposals" ("problemId", "submittedBy")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_proposals_problem_submitter"`,
    );
  }
}
