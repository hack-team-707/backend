import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCapabilityPortfolios1785200000000 implements MigrationInterface {
  name = 'AddCapabilityPortfolios1785200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "capability_portfolios" (
        "id" uuid NOT NULL,
        "ownerId" character varying NOT NULL,
        "conversationId" character varying NOT NULL,
        "slug" character varying NOT NULL,
        "capability" character varying NOT NULL,
        "tags" text array NOT NULL,
        "assessment" jsonb NOT NULL,
        "questions" jsonb NOT NULL,
        "answers" jsonb NOT NULL,
        "createdAt" character varying NOT NULL,
        CONSTRAINT "PK_capability_portfolios" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_capability_portfolios_conversation" UNIQUE ("conversationId"),
        CONSTRAINT "UQ_capability_portfolios_slug" UNIQUE ("slug")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_capability_portfolios_owner" ON "capability_portfolios" ("ownerId")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_capability_portfolios_conversation" ON "capability_portfolios" ("conversationId")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_capability_portfolios_slug" ON "capability_portfolios" ("slug")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "capability_portfolios"');
  }
}
