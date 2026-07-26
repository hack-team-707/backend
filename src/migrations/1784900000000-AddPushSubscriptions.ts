import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPushSubscriptions1784900000000 implements MigrationInterface {
  name = 'AddPushSubscriptions1784900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "push_subscriptions" ("id" uuid NOT NULL, "userId" character varying NOT NULL, "endpointHash" character varying(64), "endpoint" text NOT NULL, "p256dh" text NOT NULL, "auth" text NOT NULL, "expirationTime" bigint, "userAgent" character varying, "createdAt" character varying NOT NULL, "updatedAt" character varying NOT NULL, CONSTRAINT "UQ_push_subscriptions_endpoint_hash" UNIQUE ("endpointHash"), CONSTRAINT "PK_push_subscriptions" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_push_subscriptions_user" ON "push_subscriptions" ("userId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_push_subscriptions_user"`,
    );
    await queryRunner.query(`DROP TABLE "push_subscriptions"`);
  }
}
