import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProposalDeliverySchedules1785300000000 implements MigrationInterface {
  name = 'AddProposalDeliverySchedules1785300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "deliverySchedule" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "deliverySchedule" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projects" DROP COLUMN IF EXISTS "deliverySchedule"`,
    );
    await queryRunner.query(
      `ALTER TABLE "proposals" DROP COLUMN IF EXISTS "deliverySchedule"`,
    );
  }
}
