import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthenticationSecurity1786600000000 implements MigrationInterface {
  name = 'AddAuthenticationSecurity1786600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "passwordAlgorithm" varchar NOT NULL DEFAULT 'scrypt'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "mfaEnabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "mfaSecretEncrypted" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "mfaPendingSecretEncrypted" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "mfaVerifiedAt" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "mfaLastUsedTimeStep" bigint`,
    );

    await queryRunner.query(`
      CREATE TABLE "auth_sessions" (
        "id" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "ipAddressHash" varchar(64),
        "userAgent" varchar,
        "createdAt" varchar NOT NULL,
        "lastUsedAt" varchar NOT NULL,
        "expiresAt" varchar NOT NULL,
        "revokedAt" varchar,
        "revocationReason" varchar(120),
        "mfaVerifiedAt" varchar,
        CONSTRAINT "PK_auth_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_auth_sessions_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_auth_sessions_user" ON "auth_sessions" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_auth_sessions_expires" ON "auth_sessions" ("expiresAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_auth_sessions_active_user" ON "auth_sessions" ("userId", "expiresAt") WHERE "revokedAt" IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL,
        "sessionId" uuid NOT NULL,
        "familyId" uuid NOT NULL,
        "parentTokenId" uuid,
        "tokenHash" varchar(64) NOT NULL,
        "createdAt" varchar NOT NULL,
        "expiresAt" varchar NOT NULL,
        "consumedAt" varchar,
        "revokedAt" varchar,
        "replacedByTokenId" uuid,
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_refresh_tokens_hash" UNIQUE ("tokenHash"),
        CONSTRAINT "FK_refresh_tokens_session" FOREIGN KEY ("sessionId")
          REFERENCES "auth_sessions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_refresh_tokens_parent" FOREIGN KEY ("parentTokenId")
          REFERENCES "refresh_tokens"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_refresh_tokens_replacement" FOREIGN KEY ("replacedByTokenId")
          REFERENCES "refresh_tokens"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_session" ON "refresh_tokens" ("sessionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_family" ON "refresh_tokens" ("familyId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_expires" ON "refresh_tokens" ("expiresAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_active_session" ON "refresh_tokens" ("sessionId", "expiresAt") WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN "sessionId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN "outcome" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN "correlationId" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN "ipAddressHash" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN "userAgent" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_audit_logs_session" FOREIGN KEY ("sessionId") REFERENCES "auth_sessions"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_session" ON "audit_logs" ("sessionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_correlation" ON "audit_logs" ("correlationId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_audit_logs_correlation"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_logs_session"`);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_audit_logs_session"`,
    );
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "userAgent"`);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN "ipAddressHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN "correlationId"`,
    );
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "outcome"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "sessionId"`);

    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "auth_sessions"`);

    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "mfaLastUsedTimeStep"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "mfaVerifiedAt"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "mfaPendingSecretEncrypted"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "mfaSecretEncrypted"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "mfaEnabled"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "passwordAlgorithm"`,
    );
  }
}
