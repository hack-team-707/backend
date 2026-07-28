import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMarketplaceFinance1786700000000 implements MigrationInterface {
  name = 'AddMarketplaceFinance1786700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "marketplace_fee_configs" (
        "id" uuid NOT NULL,
        "name" varchar(120) NOT NULL,
        "version" integer NOT NULL,
        "createdBy" uuid NOT NULL,
        "feeBasisPoints" integer NOT NULL,
        "fixedFeeAmount" numeric(19,4) NOT NULL DEFAULT 0,
        "currency" varchar(3) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "effectiveFrom" timestamptz NOT NULL,
        "effectiveTo" timestamptz,
        "createdAt" timestamptz NOT NULL,
        "updatedAt" timestamptz NOT NULL,
        CONSTRAINT "PK_marketplace_fee_configs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_marketplace_fee_configs_name_version" UNIQUE ("name", "version"),
        CONSTRAINT "CHK_marketplace_fee_configs_version" CHECK ("version" > 0),
        CONSTRAINT "CHK_marketplace_fee_configs_basis_points" CHECK ("feeBasisPoints" BETWEEN 0 AND 10000),
        CONSTRAINT "CHK_marketplace_fee_configs_fixed_fee" CHECK ("fixedFeeAmount" >= 0),
        CONSTRAINT "CHK_marketplace_fee_configs_effective_range" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
        CONSTRAINT "FK_marketplace_fee_configs_created_by" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_marketplace_fee_configs_active_effective" ON "marketplace_fee_configs" ("isActive", "effectiveFrom")`,
    );

    await queryRunner.query(`
      CREATE TABLE "project_payment_plans" (
        "id" uuid NOT NULL,
        "projectId" uuid NOT NULL,
        "version" integer NOT NULL,
        "createdBy" uuid NOT NULL,
        "feeConfigId" uuid NOT NULL,
        "status" varchar NOT NULL,
        "currency" varchar(3) NOT NULL,
        "totalAmount" numeric(19,4) NOT NULL,
        "fundedAmount" numeric(19,4) NOT NULL DEFAULT 0,
        "releasedAmount" numeric(19,4) NOT NULL DEFAULT 0,
        "activatedAt" timestamptz,
        "completedAt" timestamptz,
        "createdAt" timestamptz NOT NULL,
        "updatedAt" timestamptz NOT NULL,
        CONSTRAINT "PK_project_payment_plans" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_project_payment_plans_project_version" UNIQUE ("projectId", "version"),
        CONSTRAINT "CHK_project_payment_plans_version" CHECK ("version" > 0),
        CONSTRAINT "CHK_project_payment_plans_amounts" CHECK ("totalAmount" > 0 AND "fundedAmount" >= 0 AND "releasedAmount" >= 0 AND "fundedAmount" <= "totalAmount" AND "releasedAmount" <= "fundedAmount"),
        CONSTRAINT "FK_project_payment_plans_project" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_project_payment_plans_created_by" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_project_payment_plans_fee_config" FOREIGN KEY ("feeConfigId") REFERENCES "marketplace_fee_configs"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_project_payment_plans_one_current" ON "project_payment_plans" ("projectId") WHERE "status" IN ('pending_acceptance', 'active')`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_project_payment_plans_fee_config" ON "project_payment_plans" ("feeConfigId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_project_payment_plans_status" ON "project_payment_plans" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "payment_plan_installments" (
        "id" uuid NOT NULL,
        "paymentPlanId" uuid NOT NULL,
        "sequence" integer NOT NULL,
        "description" varchar(240) NOT NULL,
        "amount" numeric(19,4) NOT NULL,
        "status" varchar NOT NULL,
        "dueAt" timestamptz NOT NULL,
        "paidAt" timestamptz,
        "createdAt" timestamptz NOT NULL,
        "updatedAt" timestamptz NOT NULL,
        CONSTRAINT "PK_payment_plan_installments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_plan_installments_plan_sequence" UNIQUE ("paymentPlanId", "sequence"),
        CONSTRAINT "CHK_payment_plan_installments_sequence" CHECK ("sequence" > 0),
        CONSTRAINT "CHK_payment_plan_installments_amount" CHECK ("amount" > 0),
        CONSTRAINT "FK_payment_plan_installments_plan" FOREIGN KEY ("paymentPlanId") REFERENCES "project_payment_plans"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_plan_installments_plan" ON "payment_plan_installments" ("paymentPlanId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_plan_installments_status" ON "payment_plan_installments" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_plan_installments_due" ON "payment_plan_installments" ("dueAt")`,
    );

    await queryRunner.query(`
      CREATE TABLE "project_participant_shares" (
        "id" uuid NOT NULL,
        "paymentPlanId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "shareBasisPoints" integer NOT NULL,
        "amount" numeric(19,4) NOT NULL,
        "acceptanceStatus" varchar NOT NULL DEFAULT 'pending',
        "respondedAt" timestamptz,
        "createdAt" timestamptz NOT NULL,
        "updatedAt" timestamptz NOT NULL,
        CONSTRAINT "PK_project_participant_shares" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_project_participant_shares_plan_user" UNIQUE ("paymentPlanId", "userId"),
        CONSTRAINT "CHK_project_participant_shares_basis_points" CHECK ("shareBasisPoints" BETWEEN 1 AND 10000),
        CONSTRAINT "CHK_project_participant_shares_amount" CHECK ("amount" >= 0),
        CONSTRAINT "CHK_project_participant_shares_acceptance" CHECK ("acceptanceStatus" IN ('pending', 'accepted', 'rejected')),
        CONSTRAINT "FK_project_participant_shares_plan" FOREIGN KEY ("paymentPlanId") REFERENCES "project_payment_plans"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_project_participant_shares_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_project_participant_shares_plan" ON "project_participant_shares" ("paymentPlanId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_project_participant_shares_user" ON "project_participant_shares" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_project_participant_shares_acceptance" ON "project_participant_shares" ("acceptanceStatus")`,
    );

    await queryRunner.query(`
      CREATE TABLE "project_payments" (
        "id" uuid NOT NULL,
        "paymentPlanId" uuid NOT NULL,
        "installmentId" uuid,
        "payerId" uuid NOT NULL,
        "provider" varchar NOT NULL,
        "providerPaymentId" varchar(255),
        "idempotencyKey" varchar(160) NOT NULL,
        "amount" numeric(19,4) NOT NULL,
        "currency" varchar(3) NOT NULL,
        "status" varchar NOT NULL,
        "failureCode" varchar(120),
        "failureMessage" varchar(1000),
        "paidAt" timestamptz,
        "createdAt" timestamptz NOT NULL,
        "updatedAt" timestamptz NOT NULL,
        CONSTRAINT "PK_project_payments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_project_payments_idempotency" UNIQUE ("idempotencyKey"),
        CONSTRAINT "CHK_project_payments_amount" CHECK ("amount" > 0),
        CONSTRAINT "FK_project_payments_plan" FOREIGN KEY ("paymentPlanId") REFERENCES "project_payment_plans"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_project_payments_installment" FOREIGN KEY ("installmentId") REFERENCES "payment_plan_installments"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_project_payments_payer" FOREIGN KEY ("payerId") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_project_payments_plan" ON "project_payments" ("paymentPlanId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_project_payments_installment" ON "project_payments" ("installmentId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_project_payments_payer" ON "project_payments" ("payerId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_project_payments_status" ON "project_payments" ("status")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_project_payments_provider_reference" ON "project_payments" ("provider", "providerPaymentId") WHERE "providerPaymentId" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "payment_webhook_events" (
        "id" uuid NOT NULL,
        "provider" varchar NOT NULL,
        "providerEventId" varchar(255) NOT NULL,
        "eventType" varchar(120) NOT NULL,
        "payload" jsonb NOT NULL,
        "status" varchar NOT NULL,
        "attemptCount" integer NOT NULL DEFAULT 0,
        "lastError" varchar(2000),
        "receivedAt" timestamptz NOT NULL,
        "processedAt" timestamptz,
        CONSTRAINT "PK_payment_webhook_events" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_webhook_events_provider_event" UNIQUE ("provider", "providerEventId"),
        CONSTRAINT "CHK_payment_webhook_events_attempt_count" CHECK ("attemptCount" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_webhook_events_status" ON "payment_webhook_events" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_webhook_events_received" ON "payment_webhook_events" ("receivedAt")`,
    );

    await queryRunner.query(`
      CREATE TABLE "wallets" (
        "id" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "currency" varchar(3) NOT NULL,
        "status" varchar NOT NULL,
        "createdAt" timestamptz NOT NULL,
        "updatedAt" timestamptz NOT NULL,
        CONSTRAINT "PK_wallets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wallets_user_currency" UNIQUE ("userId", "currency"),
        CONSTRAINT "FK_wallets_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_wallets_user" ON "wallets" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_wallets_status" ON "wallets" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "withdrawal_requests" (
        "id" uuid NOT NULL,
        "walletId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "amount" numeric(19,4) NOT NULL,
        "currency" varchar(3) NOT NULL,
        "status" varchar NOT NULL,
        "destinationType" varchar(80) NOT NULL,
        "destinationReference" varchar(500) NOT NULL,
        "idempotencyKey" varchar(160) NOT NULL,
        "failureReason" varchar(1000),
        "requestedAt" timestamptz NOT NULL,
        "reviewedAt" timestamptz,
        "processedAt" timestamptz,
        "createdAt" timestamptz NOT NULL,
        "updatedAt" timestamptz NOT NULL,
        CONSTRAINT "PK_withdrawal_requests" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_withdrawal_requests_idempotency" UNIQUE ("idempotencyKey"),
        CONSTRAINT "CHK_withdrawal_requests_amount" CHECK ("amount" > 0),
        CONSTRAINT "FK_withdrawal_requests_wallet" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_withdrawal_requests_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_withdrawal_requests_wallet" ON "withdrawal_requests" ("walletId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_withdrawal_requests_user" ON "withdrawal_requests" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_withdrawal_requests_status" ON "withdrawal_requests" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "payment_distributions" (
        "id" uuid NOT NULL,
        "paymentId" uuid NOT NULL,
        "participantShareId" uuid,
        "recipientUserId" uuid,
        "walletId" uuid,
        "type" varchar NOT NULL,
        "amount" numeric(19,4) NOT NULL,
        "currency" varchar(3) NOT NULL,
        "idempotencyKey" varchar(160) NOT NULL,
        "createdAt" timestamptz NOT NULL,
        CONSTRAINT "PK_payment_distributions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_distributions_idempotency" UNIQUE ("idempotencyKey"),
        CONSTRAINT "CHK_payment_distributions_amount" CHECK ("amount" > 0),
        CONSTRAINT "FK_payment_distributions_payment" FOREIGN KEY ("paymentId") REFERENCES "project_payments"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_payment_distributions_share" FOREIGN KEY ("participantShareId") REFERENCES "project_participant_shares"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_payment_distributions_recipient" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_payment_distributions_wallet" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_distributions_payment" ON "payment_distributions" ("paymentId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_distributions_share" ON "payment_distributions" ("participantShareId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_distributions_recipient" ON "payment_distributions" ("recipientUserId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_distributions_wallet" ON "payment_distributions" ("walletId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "wallet_ledger_entries" (
        "id" uuid NOT NULL,
        "walletId" uuid NOT NULL,
        "paymentDistributionId" uuid,
        "bucket" varchar NOT NULL,
        "direction" varchar NOT NULL,
        "type" varchar NOT NULL,
        "amount" numeric(19,4) NOT NULL,
        "currency" varchar(3) NOT NULL,
        "idempotencyKey" varchar(160) NOT NULL,
        "description" varchar(500),
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" timestamptz NOT NULL,
        CONSTRAINT "PK_wallet_ledger_entries" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wallet_ledger_entries_idempotency" UNIQUE ("idempotencyKey"),
        CONSTRAINT "CHK_wallet_ledger_entries_amount" CHECK ("amount" > 0),
        CONSTRAINT "CHK_wallet_ledger_entries_bucket" CHECK ("bucket" IN ('pending', 'available', 'held')),
        CONSTRAINT "CHK_wallet_ledger_entries_direction" CHECK ("direction" IN ('credit', 'debit')),
        CONSTRAINT "FK_wallet_ledger_entries_wallet" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_wallet_ledger_entries_distribution" FOREIGN KEY ("paymentDistributionId") REFERENCES "payment_distributions"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_wallet_ledger_entries_wallet_created" ON "wallet_ledger_entries" ("walletId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_wallet_ledger_entries_distribution" ON "wallet_ledger_entries" ("paymentDistributionId")`,
    );
    await queryRunner.query(`
      CREATE FUNCTION reject_wallet_ledger_entry_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'wallet_ledger_entries is append-only';
      END;
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_wallet_ledger_entries_append_only"
      BEFORE UPDATE OR DELETE ON "wallet_ledger_entries"
      FOR EACH ROW EXECUTE FUNCTION reject_wallet_ledger_entry_mutation()
    `);

    await queryRunner.query(`
      CREATE TABLE "payouts" (
        "id" uuid NOT NULL,
        "withdrawalRequestId" uuid NOT NULL,
        "provider" varchar NOT NULL,
        "providerPayoutId" varchar(255),
        "idempotencyKey" varchar(160) NOT NULL,
        "amount" numeric(19,4) NOT NULL,
        "feeAmount" numeric(19,4) NOT NULL DEFAULT 0,
        "netAmount" numeric(19,4) NOT NULL,
        "currency" varchar(3) NOT NULL,
        "status" varchar NOT NULL,
        "failureCode" varchar(120),
        "failureMessage" varchar(1000),
        "paidAt" timestamptz,
        "createdAt" timestamptz NOT NULL,
        "updatedAt" timestamptz NOT NULL,
        CONSTRAINT "PK_payouts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payouts_withdrawal" UNIQUE ("withdrawalRequestId"),
        CONSTRAINT "UQ_payouts_idempotency" UNIQUE ("idempotencyKey"),
        CONSTRAINT "CHK_payouts_amounts" CHECK ("amount" > 0 AND "feeAmount" >= 0 AND "netAmount" >= 0 AND "netAmount" + "feeAmount" = "amount"),
        CONSTRAINT "FK_payouts_withdrawal" FOREIGN KEY ("withdrawalRequestId") REFERENCES "withdrawal_requests"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_payouts_status" ON "payouts" ("status")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_payouts_provider_reference" ON "payouts" ("provider", "providerPayoutId") WHERE "providerPayoutId" IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "payouts"`);
    await queryRunner.query(
      `DROP TRIGGER "TRG_wallet_ledger_entries_append_only" ON "wallet_ledger_entries"`,
    );
    await queryRunner.query(
      `DROP FUNCTION reject_wallet_ledger_entry_mutation()`,
    );
    await queryRunner.query(`DROP TABLE "wallet_ledger_entries"`);
    await queryRunner.query(`DROP TABLE "payment_distributions"`);
    await queryRunner.query(`DROP TABLE "withdrawal_requests"`);
    await queryRunner.query(`DROP TABLE "wallets"`);
    await queryRunner.query(`DROP TABLE "payment_webhook_events"`);
    await queryRunner.query(`DROP TABLE "project_payments"`);
    await queryRunner.query(`DROP TABLE "project_participant_shares"`);
    await queryRunner.query(`DROP TABLE "payment_plan_installments"`);
    await queryRunner.query(`DROP TABLE "project_payment_plans"`);
    await queryRunner.query(`DROP TABLE "marketplace_fee_configs"`);
  }
}
