import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConversationAiMessages1784800000000 implements MigrationInterface {
  name = 'AddConversationAiMessages1784800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."messages_role_enum" AS ENUM('user', 'assistant', 'system')`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD "role" "public"."messages_role_enum" NOT NULL DEFAULT 'user'`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD "replyToMessageId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD "analysisMetadata" jsonb`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_messages_reply_to" ON "messages" ("replyToMessageId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_messages_reply_to"`);
    await queryRunner.query(
      `ALTER TABLE "messages" DROP COLUMN "analysisMetadata"`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" DROP COLUMN "replyToMessageId"`,
    );
    await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "role"`);
    await queryRunner.query(`DROP TYPE "public"."messages_role_enum"`);
  }
}
