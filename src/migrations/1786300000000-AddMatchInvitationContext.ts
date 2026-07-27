import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMatchInvitationContext1786300000000 implements MigrationInterface {
  name = 'AddMatchInvitationContext1786300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "invitationKind" character varying',
    );
    await queryRunner.query(
      'ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "teamId" uuid',
    );
    await queryRunner.query(
      'ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "teamRole" character varying',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "matches" DROP COLUMN IF EXISTS "teamRole"',
    );
    await queryRunner.query(
      'ALTER TABLE "matches" DROP COLUMN IF EXISTS "teamId"',
    );
    await queryRunner.query(
      'ALTER TABLE "matches" DROP COLUMN IF EXISTS "invitationKind"',
    );
  }
}
