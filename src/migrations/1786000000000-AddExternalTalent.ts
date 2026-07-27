import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExternalTalent1786000000000 implements MigrationInterface {
  name = 'AddExternalTalent1786000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "external_talent_searches_modality_enum" AS ENUM ('REMOTE','LOCAL','HYBRID')`,
    );
    await queryRunner.query(
      `CREATE TYPE "external_talent_results_provider_enum" AS ENUM ('FREELANCER','GOOGLE_PLACES')`,
    );
    await queryRunner.query(
      `CREATE TYPE "external_talent_results_resulttype_enum" AS ENUM ('PERSON','BUSINESS')`,
    );
    await queryRunner.query(`
      CREATE TABLE "external_talent_searches" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "problemId" uuid NOT NULL,
        "requestedBy" uuid NOT NULL,
        "modality" "external_talent_searches_modality_enum" NOT NULL,
        "query" varchar(500) NOT NULL,
        "requiredSkills" text[] NOT NULL DEFAULT '{}',
        "providersExecuted" jsonb NOT NULL DEFAULT '[]',
        "status" varchar(30) NOT NULL DEFAULT 'completed',
        "totalResults" integer NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_external_talent_searches" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_external_talent_search_problem" ON "external_talent_searches" ("problemId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_external_talent_search_requester" ON "external_talent_searches" ("requestedBy")`,
    );
    await queryRunner.query(`
      CREATE TABLE "external_talent_results" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "searchId" uuid NOT NULL,
        "provider" "external_talent_results_provider_enum" NOT NULL,
        "externalId" varchar(255) NOT NULL,
        "resultType" "external_talent_results_resulttype_enum" NOT NULL,
        "name" varchar(500) NOT NULL,
        "headline" varchar(500),
        "description" text,
        "skills" text[] NOT NULL DEFAULT '{}',
        "rating" double precision,
        "reviewCount" integer,
        "hourlyRate" double precision,
        "currency" varchar(12),
        "location" jsonb,
        "profileUrl" text,
        "contactUrl" text,
        "websiteUrl" text,
        "phone" varchar(80),
        "availability" varchar(20) NOT NULL DEFAULT 'UNKNOWN',
        "compatibilityScore" double precision NOT NULL,
        "compatibilityReasons" text[] NOT NULL DEFAULT '{}',
        "missingSkills" text[] NOT NULL DEFAULT '{}',
        "metadata" jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "expiresAt" timestamptz NOT NULL,
        CONSTRAINT "PK_external_talent_results" PRIMARY KEY ("id"),
        CONSTRAINT "FK_external_talent_results_search" FOREIGN KEY ("searchId")
          REFERENCES "external_talent_searches"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_external_talent_result_search" ON "external_talent_results" ("searchId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_external_talent_result_provider_external" ON "external_talent_results" ("provider","externalId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_external_talent_result_created" ON "external_talent_results" ("createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_external_talent_result_expires" ON "external_talent_results" ("expiresAt")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "external_talent_results"`);
    await queryRunner.query(`DROP TABLE "external_talent_searches"`);
    await queryRunner.query(
      `DROP TYPE "external_talent_results_resulttype_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "external_talent_results_provider_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "external_talent_searches_modality_enum"`,
    );
  }
}
