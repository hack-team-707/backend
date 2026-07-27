import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMatchRequests1786100000000 implements MigrationInterface {
  name = 'AddMatchRequests1786100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "requestedAt" character varying',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "matches" DROP COLUMN IF EXISTS "requestedAt"',
    );
  }
}
