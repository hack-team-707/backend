import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNoMatchResolutions1785900000000 implements MigrationInterface {
  name = 'AddNoMatchResolutions1785900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "no_match_resolutions" ("id" uuid NOT NULL, "problemId" character varying NOT NULL, "ownerId" character varying NOT NULL, "minimumCoverage" double precision NOT NULL, "bestCoverage" double precision NOT NULL, "requiredSkills" text array NOT NULL, "message" text NOT NULL, "recommendations" jsonb NOT NULL, "aiGuide" jsonb, "createdAt" character varying NOT NULL, "updatedAt" character varying NOT NULL, CONSTRAINT "UQ_no_match_problem" UNIQUE ("problemId"), CONSTRAINT "PK_no_match_resolutions" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_no_match_problem" ON "no_match_resolutions" ("problemId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_no_match_owner" ON "no_match_resolutions" ("ownerId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_no_match_owner"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_no_match_problem"`);
    await queryRunner.query(`DROP TABLE "no_match_resolutions"`);
  }
}
