import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrivateProjectRoom1786500000000 implements MigrationInterface {
  name = 'AddPrivateProjectRoom1786500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "project_channels" (
        "id" uuid NOT NULL,
        "projectId" uuid NOT NULL,
        "name" varchar(120) NOT NULL,
        "type" varchar NOT NULL,
        "createdBy" uuid NOT NULL,
        "isDefault" boolean NOT NULL DEFAULT false,
        "isArchived" boolean NOT NULL DEFAULT false,
        "clientIncluded" boolean NOT NULL DEFAULT false,
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL,
        CONSTRAINT "PK_project_channels" PRIMARY KEY ("id"),
        CONSTRAINT "FK_project_channels_project" FOREIGN KEY ("projectId")
          REFERENCES "projects"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_project_channels_project" ON "project_channels" ("projectId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_project_channels_default_type" ON "project_channels" ("projectId", "type") WHERE "type" IN ('general', 'team_internal')`,
    );

    await queryRunner.query(`
      CREATE TABLE "project_channel_members" (
        "id" uuid NOT NULL,
        "channelId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "joinedAt" varchar NOT NULL,
        "removedAt" varchar,
        "lastReadAt" varchar,
        CONSTRAINT "PK_project_channel_members" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_project_channel_members_channel_user" UNIQUE ("channelId", "userId"),
        CONSTRAINT "FK_project_channel_members_channel" FOREIGN KEY ("channelId")
          REFERENCES "project_channels"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_project_channel_members_channel" ON "project_channel_members" ("channelId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_project_channel_members_user" ON "project_channel_members" ("userId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "project_messages" ADD COLUMN "conversationId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_messages" ADD COLUMN "parentMessageId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_messages" ADD COLUMN "mentionUserIds" text[] NOT NULL DEFAULT '{}'::text[]`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_messages" ADD COLUMN "reactions" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_messages" ADD COLUMN "idempotencyKey" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_messages" ADD COLUMN "editedAt" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_messages" ADD COLUMN "deletedAt" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_messages" ADD COLUMN "updatedAt" varchar`,
    );
    await queryRunner.query(
      `UPDATE "project_messages" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_messages" ALTER COLUMN "updatedAt" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_messages" ADD CONSTRAINT "FK_project_messages_channel" FOREIGN KEY ("conversationId") REFERENCES "project_channels"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_messages" ADD CONSTRAINT "FK_project_messages_parent" FOREIGN KEY ("parentMessageId") REFERENCES "project_messages"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_project_messages_conversation" ON "project_messages" ("conversationId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_project_messages_idempotency" ON "project_messages" ("conversationId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "project_files" (
        "id" uuid NOT NULL,
        "projectId" uuid NOT NULL,
        "conversationId" uuid,
        "messageId" uuid,
        "uploadedBy" uuid NOT NULL,
        "originalName" varchar(255) NOT NULL,
        "storedName" varchar(255) NOT NULL,
        "mimeType" varchar(160) NOT NULL,
        "extension" varchar(16) NOT NULL,
        "size" bigint NOT NULL,
        "storageKey" varchar(500) NOT NULL,
        "category" varchar NOT NULL,
        "visibility" varchar NOT NULL,
        "deletedAt" varchar,
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL,
        CONSTRAINT "PK_project_files" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_project_files_storage_key" UNIQUE ("storageKey"),
        CONSTRAINT "FK_project_files_project" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_project_files_channel" FOREIGN KEY ("conversationId") REFERENCES "project_channels"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_project_files_message" FOREIGN KEY ("messageId") REFERENCES "project_messages"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_project_files_project" ON "project_files" ("projectId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_project_files_conversation" ON "project_files" ("conversationId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "project_links" (
        "id" uuid NOT NULL,
        "projectId" uuid NOT NULL,
        "conversationId" uuid,
        "createdBy" uuid NOT NULL,
        "type" varchar NOT NULL,
        "url" varchar(2048) NOT NULL,
        "title" varchar(200) NOT NULL,
        "description" varchar(1000),
        "repositoryName" varchar(200),
        "defaultBranch" varchar(160),
        "modulePath" varchar(300),
        "visibility" varchar NOT NULL,
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL,
        CONSTRAINT "PK_project_links" PRIMARY KEY ("id"),
        CONSTRAINT "FK_project_links_project" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_project_links_channel" FOREIGN KEY ("conversationId") REFERENCES "project_channels"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_project_links_project" ON "project_links" ("projectId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "project_meetings" (
        "id" uuid NOT NULL,
        "projectId" uuid NOT NULL,
        "conversationId" uuid,
        "createdBy" uuid NOT NULL,
        "title" varchar(200) NOT NULL,
        "description" varchar(2000),
        "type" varchar NOT NULL,
        "status" varchar NOT NULL,
        "startAt" varchar NOT NULL,
        "endAt" varchar NOT NULL,
        "timezone" varchar(80) NOT NULL,
        "meetingUrl" varchar(2048),
        "reminderMinutes" integer NOT NULL DEFAULT 30,
        "notes" varchar(5000),
        "participantIds" text[] NOT NULL,
        "visibility" varchar NOT NULL,
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL,
        CONSTRAINT "PK_project_meetings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_project_meetings_project" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_project_meetings_channel" FOREIGN KEY ("conversationId") REFERENCES "project_channels"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_project_meetings_project" ON "project_meetings" ("projectId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "project_activities" (
        "id" uuid NOT NULL,
        "projectId" uuid NOT NULL,
        "conversationId" uuid,
        "actorId" uuid,
        "type" varchar(80) NOT NULL,
        "entityId" uuid,
        "visibility" varchar NOT NULL DEFAULT 'project',
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" varchar NOT NULL,
        CONSTRAINT "PK_project_activities" PRIMARY KEY ("id"),
        CONSTRAINT "FK_project_activities_project" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_project_activities_channel" FOREIGN KEY ("conversationId") REFERENCES "project_channels"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_project_activities_project" ON "project_activities" ("projectId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_project_activities_created" ON "project_activities" ("projectId", "createdAt")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "project_activities"`);
    await queryRunner.query(`DROP TABLE "project_meetings"`);
    await queryRunner.query(`DROP TABLE "project_links"`);
    await queryRunner.query(`DROP TABLE "project_files"`);
    await queryRunner.query(`DROP INDEX "IDX_project_messages_idempotency"`);
    await queryRunner.query(`DROP INDEX "IDX_project_messages_conversation"`);
    await queryRunner.query(
      `ALTER TABLE "project_messages" DROP CONSTRAINT "FK_project_messages_parent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_messages" DROP CONSTRAINT "FK_project_messages_channel"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_messages" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_messages" DROP COLUMN "deletedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_messages" DROP COLUMN "editedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_messages" DROP COLUMN "idempotencyKey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_messages" DROP COLUMN "reactions"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_messages" DROP COLUMN "mentionUserIds"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_messages" DROP COLUMN "parentMessageId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_messages" DROP COLUMN "conversationId"`,
    );
    await queryRunner.query(`DROP TABLE "project_channel_members"`);
    await queryRunner.query(`DROP TABLE "project_channels"`);
  }
}
