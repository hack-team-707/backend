import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FixProposalNotificationLinks1785500000000
  implements MigrationInterface
{
  name = 'FixProposalNotificationLinks1785500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "notifications" SET "href" = '/problems' WHERE "type" = 'proposal_received' AND ("href" IS NULL OR "href" = '/projects')`,
    );
  }

  async down(): Promise<void> {
    // Notification destinations are data corrections and are intentionally retained.
  }
}
