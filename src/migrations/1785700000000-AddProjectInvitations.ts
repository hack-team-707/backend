import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectInvitations1785700000000 implements MigrationInterface {
  name = 'AddProjectInvitations1785700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "project_invitations" (
        "id" uuid PRIMARY KEY,
        "projectId" uuid NOT NULL,
        "invitedUserId" uuid NOT NULL,
        "invitedBy" uuid NOT NULL,
        "desiredSkills" text[] NOT NULL DEFAULT '{}',
        "status" varchar NOT NULL,
        "createdAt" varchar NOT NULL,
        "updatedAt" varchar NOT NULL,
        "respondedAt" varchar NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_project_invitations_project" ON "project_invitations" ("projectId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_project_invitations_user" ON "project_invitations" ("invitedUserId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_project_invitations_lookup" ON "project_invitations" ("projectId", "invitedUserId", "status")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "project_invitations"`);
  }
}
