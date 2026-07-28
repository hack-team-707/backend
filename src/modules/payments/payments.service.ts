import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bull';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  addMoney,
  allocateByBasisPoints,
  compareMoney,
  formatMoney,
  multiplyByBasisPoints,
  parseMoney,
  subtractMoney,
} from '../../common/money';
import {
  LedgerBalanceBucket,
  LedgerEntryDirection,
  LedgerEntryType,
  PaymentDistributionType,
  PaymentInstallmentStatus,
  PaymentPlanStatus,
  PaymentProvider as PaymentProviderKind,
  PaymentRefundStatus,
  PaymentStatus,
  PaymentWebhookStatus,
  UserRole,
  WalletStatus,
} from '../../shared';
import { MarketplaceFeeConfig } from '../marketplace-fees/entities/marketplace-fee-config.entity';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentPlanInstallment } from '../payment-plans/entities/payment-plan-installment.entity';
import { ProjectPaymentPlan } from '../payment-plans/entities/project-payment-plan.entity';
import { ProjectParticipantShare } from '../payment-plans/entities/project-participant-share.entity';
import { Project } from '../projects/entities/project.entity';
import { CreateCheckoutDto, CreateRefundDto } from './dto/payment.dto';
import { PaymentRefund } from './entities/payment-refund.entity';
import { PaymentDistribution } from './entities/payment-distribution.entity';
import { PaymentWebhookEvent } from './entities/payment-webhook-event.entity';
import { ProjectPayment } from './entities/project-payment.entity';
import { WalletLedgerEntry } from '../wallets/entities/wallet-ledger-entry.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
  ProviderPayment,
} from './providers/payment-provider';
import { PaymentProviderError } from './providers/mercado-pago-payment.provider';

export const PAYMENT_WEBHOOK_QUEUE = 'payment-webhooks';
export const MERCADO_PAGO_WEBHOOK_JOB = 'mercado-pago';

export interface CheckoutResult {
  payment: ProjectPayment;
  preferenceId: string;
  checkoutUrl: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    @InjectQueue(PAYMENT_WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: PaymentProvider,
  ) {}

  async createCheckout(
    userId: string,
    projectId: string,
    idempotencyKey: string | undefined,
    dto: CreateCheckoutDto,
  ): Promise<CheckoutResult> {
    this.assertEnabled();
    const key = this.requireIdempotencyKey(idempotencyKey);
    if (!dto.confirmed)
      throw new ConflictException('Explicit checkout confirmation is required');

    const payment = await this.dataSource.transaction(
      'SERIALIZABLE',
      async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `payment-checkout:${key}`,
        ]);
        const existing = await manager
          .getRepository(ProjectPayment)
          .findOneBy({ idempotencyKey: key });
        if (existing) {
          const existingPlan = await manager
            .getRepository(ProjectPaymentPlan)
            .findOneBy({ id: existing.paymentPlanId });
          if (
            !existingPlan ||
            existingPlan.projectId !== projectId ||
            existing.payerId !== userId ||
            existing.installmentId !== dto.installmentId
          )
            throw new ConflictException(
              'Idempotency-Key was already used for another operation',
            );
          return existing;
        }
        const project = await manager.getRepository(Project).findOneBy({
          id: projectId,
        });
        if (!project) throw new NotFoundException('Project not found');
        if (project.requesterId !== userId)
          throw new ForbiddenException(
            'Only the project requester can create a checkout',
          );
        const plan = await manager.getRepository(ProjectPaymentPlan).findOne({
          where: { projectId, status: PaymentPlanStatus.ACTIVE },
          lock: { mode: 'pessimistic_write' },
        });
        if (!plan) throw new ConflictException('Payment plan is not active');
        const installment = await manager
          .getRepository(PaymentPlanInstallment)
          .findOne({
            where: { id: dto.installmentId, paymentPlanId: plan.id },
            lock: { mode: 'pessimistic_write' },
          });
        if (!installment)
          throw new NotFoundException('Payment installment not found');
        if (
          [
            PaymentInstallmentStatus.PAID,
            PaymentInstallmentStatus.REFUNDED,
            PaymentInstallmentStatus.CANCELLED,
          ].includes(installment.status)
        )
          throw new ConflictException('Payment installment is not payable');
        const activePayment = await manager
          .getRepository(ProjectPayment)
          .findOne({
            where: {
              installmentId: installment.id,
              status: In([
                PaymentStatus.PENDING,
                PaymentStatus.PROCESSING,
                PaymentStatus.SUCCEEDED,
              ]),
            },
          });
        if (activePayment)
          throw new ConflictException(
            'Payment installment already has an active payment operation',
          );
        const now = new Date();
        return manager.getRepository(ProjectPayment).save(
          manager.getRepository(ProjectPayment).create({
            id: randomUUID(),
            paymentPlanId: plan.id,
            installmentId: installment.id,
            payerId: userId,
            provider: PaymentProviderKind.MERCADO_PAGO,
            providerPaymentId: null,
            providerPreferenceId: null,
            checkoutUrl: null,
            providerStatus: null,
            externalReference: null,
            idempotencyKey: key,
            amount: formatMoney(parseMoney(installment.amount)),
            currency: plan.currency,
            status: PaymentStatus.PENDING,
            failureCode: null,
            failureMessage: null,
            paidAt: null,
            createdAt: now,
            updatedAt: now,
          }),
        );
      },
    );

    if (!payment.providerPreferenceId || !payment.checkoutUrl) {
      const installment = await this.dataSource
        .getRepository(PaymentPlanInstallment)
        .findOneBy({ id: payment.installmentId! });
      if (!installment)
        throw new NotFoundException('Payment installment not found');
      try {
        const preference = await this.provider.createPreference({
          paymentId: payment.id,
          installmentDescription: installment.description,
          amount: payment.amount,
          currency: payment.currency,
          idempotencyKey: key,
        });
        payment.providerPreferenceId = preference.id;
        payment.checkoutUrl = preference.checkoutUrl;
        payment.externalReference = preference.externalReference;
        payment.updatedAt = new Date();
        await this.dataSource.transaction(async (manager) => {
          await manager.getRepository(ProjectPayment).save(payment);
          installment.status = PaymentInstallmentStatus.PROCESSING;
          installment.updatedAt = new Date();
          await manager.getRepository(PaymentPlanInstallment).save(installment);
        });
      } catch (error) {
        this.rethrowProviderError(error);
      }
    }
    return {
      payment,
      preferenceId: payment.providerPreferenceId!,
      checkoutUrl: payment.checkoutUrl!,
    };
  }

  async findOne(
    userId: string,
    projectId: string,
    paymentId: string,
  ): Promise<ProjectPayment> {
    const payment = await this.dataSource
      .getRepository(ProjectPayment)
      .findOneBy({ id: paymentId });
    if (!payment) throw new NotFoundException('Payment not found');
    await this.assertPaymentParticipant(userId, projectId, payment);
    return payment;
  }

  async findForProject(
    userId: string,
    projectId: string,
  ): Promise<ProjectPayment[]> {
    const project = await this.dataSource
      .getRepository(Project)
      .findOneBy({ id: projectId });
    if (!project) throw new NotFoundException('Project not found');
    if (!project.participantIds.includes(userId))
      throw new ForbiddenException('User is not a project participant');
    const plans = await this.dataSource
      .getRepository(ProjectPaymentPlan)
      .find({ where: { projectId } });
    if (!plans.length) return [];
    return this.dataSource.getRepository(ProjectPayment).find({
      where: { paymentPlanId: In(plans.map((plan) => plan.id)) },
      order: { createdAt: 'DESC' },
    });
  }

  async receiveMercadoPagoWebhook(input: {
    dataId: string;
    requestId: string;
    eventType: string;
  }): Promise<void> {
    this.assertEnabled();
    const providerEventId = `${input.requestId}:${input.dataId}`;
    let event = await this.dataSource
      .getRepository(PaymentWebhookEvent)
      .findOneBy({
        provider: PaymentProviderKind.MERCADO_PAGO,
        providerEventId,
      });
    if (!event) {
      try {
        event = await this.dataSource.getRepository(PaymentWebhookEvent).save({
          id: randomUUID(),
          provider: PaymentProviderKind.MERCADO_PAGO,
          providerEventId,
          eventType: input.eventType,
          payload: { dataId: input.dataId },
          status: PaymentWebhookStatus.RECEIVED,
          attemptCount: 0,
          lastError: null,
          receivedAt: new Date(),
          processedAt: null,
        });
      } catch {
        event = await this.dataSource
          .getRepository(PaymentWebhookEvent)
          .findOneByOrFail({
            provider: PaymentProviderKind.MERCADO_PAGO,
            providerEventId,
          });
      }
    }
    if (event.status === PaymentWebhookStatus.PROCESSED) return;
    await this.webhookQueue.add(
      MERCADO_PAGO_WEBHOOK_JOB,
      { eventId: event.id },
      {
        jobId: event.id,
        attempts: 6,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  async processWebhookEvent(eventId: string): Promise<void> {
    const event = await this.dataSource
      .getRepository(PaymentWebhookEvent)
      .findOneBy({ id: eventId });
    if (!event || event.status === PaymentWebhookStatus.PROCESSED) return;
    const dataId = event.payload.dataId;
    if (typeof dataId !== 'string')
      throw new ConflictException('Webhook event has no payment ID');
    event.status = PaymentWebhookStatus.PROCESSING;
    event.attemptCount += 1;
    event.lastError = null;
    await this.dataSource.getRepository(PaymentWebhookEvent).save(event);

    try {
      const verified = await this.provider.getPayment(dataId);
      await this.applyVerifiedPaymentState(eventId, verified);
    } catch (error) {
      await this.dataSource.getRepository(PaymentWebhookEvent).update(eventId, {
        status: PaymentWebhookStatus.FAILED,
        lastError:
          error instanceof PaymentProviderError
            ? error.code
            : 'processing_error',
      });
      throw error;
    }
  }

  async applyVerifiedPaymentState(
    eventId: string,
    verified: ProviderPayment,
  ): Promise<void> {
    const result = await this.dataSource.transaction(async (manager) => {
      const event = await manager.getRepository(PaymentWebhookEvent).findOne({
        where: { id: eventId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!event || event.status === PaymentWebhookStatus.PROCESSED)
        return null;
      if (!verified.externalReference)
        throw new ConflictException(
          'Provider payment has no external reference',
        );
      const payment = await manager.getRepository(ProjectPayment).findOne({
        where: { id: verified.externalReference },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment)
        throw new NotFoundException('Referenced payment was not found');
      if (
        compareMoney(
          parseMoney(payment.amount),
          parseMoney(verified.amount),
        ) !== 0 ||
        payment.currency !== verified.currency.toUpperCase()
      )
        throw new ConflictException(
          'Provider payment does not match expected funds',
        );
      if (
        payment.providerPaymentId &&
        payment.providerPaymentId !== verified.id
      )
        throw new ConflictException('Provider payment reference changed');
      const previousStatus = payment.status;
      payment.providerPaymentId = verified.id;
      payment.externalReference = verified.externalReference;
      payment.providerStatus = verified.providerStatus;
      payment.status = verified.status;
      payment.updatedAt = new Date();
      payment.failureCode =
        verified.status === PaymentStatus.FAILED
          ? verified.providerStatus
          : null;
      payment.failureMessage = null;
      if (verified.status === PaymentStatus.SUCCEEDED && !payment.paidAt)
        payment.paidAt = new Date();

      const installment = payment.installmentId
        ? await manager.getRepository(PaymentPlanInstallment).findOne({
            where: { id: payment.installmentId },
            lock: { mode: 'pessimistic_write' },
          })
        : null;
      const plan = await manager.getRepository(ProjectPaymentPlan).findOne({
        where: { id: payment.paymentPlanId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!plan) throw new NotFoundException('Payment plan not found');
      const firstSuccess =
        verified.status === PaymentStatus.SUCCEEDED &&
        previousStatus !== PaymentStatus.SUCCEEDED;
      const firstRefund =
        verified.status === PaymentStatus.REFUNDED &&
        previousStatus !== PaymentStatus.REFUNDED;
      if (firstSuccess) {
        plan.fundedAmount = formatMoney(
          addMoney(parseMoney(plan.fundedAmount), parseMoney(payment.amount)),
        );
        if (
          compareMoney(
            parseMoney(plan.fundedAmount),
            parseMoney(plan.totalAmount),
          ) > 0
        )
          throw new ConflictException('Payment would overfund the plan');
        if (installment) {
          installment.status = PaymentInstallmentStatus.PAID;
          installment.paidAt = payment.paidAt;
        }
        await this.distributeSuccessfulPayment(manager, payment, plan);
      } else if (firstRefund) {
        plan.fundedAmount = formatMoney(
          subtractMoney(
            parseMoney(plan.fundedAmount),
            parseMoney(payment.amount),
          ),
        );
        if (installment) {
          installment.status = PaymentInstallmentStatus.REFUNDED;
          installment.paidAt = null;
        }
      } else if (installment) {
        installment.status = this.installmentStatus(verified.status);
      }
      plan.updatedAt = new Date();
      if (installment) {
        installment.updatedAt = new Date();
        await manager.getRepository(PaymentPlanInstallment).save(installment);
      }
      await manager.getRepository(ProjectPaymentPlan).save(plan);
      await manager.getRepository(ProjectPayment).save(payment);
      event.status = PaymentWebhookStatus.PROCESSED;
      event.processedAt = new Date();
      event.lastError = null;
      await manager.getRepository(PaymentWebhookEvent).save(event);
      const project = await manager
        .getRepository(Project)
        .findOneBy({ id: plan.projectId });
      return { payment, project, previousStatus };
    });
    if (result && result.previousStatus !== result.payment.status)
      await this.notifyPaymentState(result.project, result.payment);
  }

  async refund(
    userId: string,
    roles: UserRole[],
    projectId: string,
    paymentId: string,
    idempotencyKey: string | undefined,
    dto: CreateRefundDto,
  ): Promise<PaymentRefund> {
    this.assertEnabled();
    const key = this.requireIdempotencyKey(idempotencyKey);
    if (!dto.confirmed)
      throw new ConflictException('Explicit refund confirmation is required');
    const refund = await this.dataSource.transaction(
      'SERIALIZABLE',
      async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `payment-refund:${key}`,
        ]);
        const existing = await manager
          .getRepository(PaymentRefund)
          .findOneBy({ idempotencyKey: key });
        if (existing) {
          if (
            existing.paymentId !== paymentId ||
            existing.requestedBy !== userId ||
            existing.reason !== dto.reason
          )
            throw new ConflictException(
              'Idempotency-Key was already used for another operation',
            );
          return existing;
        }
        const payment = await manager.getRepository(ProjectPayment).findOne({
          where: { id: paymentId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!payment) throw new NotFoundException('Payment not found');
        const project = await this.projectForPayment(manager, payment);
        if (project.id !== projectId)
          throw new NotFoundException('Payment not found');
        if (project.requesterId !== userId && !roles.includes(UserRole.ADMIN))
          throw new ForbiddenException('Only requester or admin can refund');
        if (payment.status !== PaymentStatus.SUCCEEDED)
          throw new ConflictException(
            'Only succeeded payments can be refunded',
          );
        const paymentPlan = await manager
          .getRepository(ProjectPaymentPlan)
          .findOneBy({ id: payment.paymentPlanId });
        if (
          paymentPlan &&
          compareMoney(parseMoney(paymentPlan.releasedAmount), 0n) > 0
        )
          throw new ConflictException(
            'Released project funds cannot be refunded automatically',
          );
        const activeRefund = await manager
          .getRepository(PaymentRefund)
          .findOne({
            where: {
              paymentId,
              status: In([
                PaymentRefundStatus.PROCESSING,
                PaymentRefundStatus.REFUNDED,
              ]),
            },
          });
        if (activeRefund)
          throw new ConflictException(
            'Payment already has an active refund operation',
          );
        const now = new Date();
        return manager.getRepository(PaymentRefund).save({
          id: randomUUID(),
          paymentId,
          amount: payment.amount,
          currency: payment.currency,
          providerRefundId: null,
          status: PaymentRefundStatus.PROCESSING,
          reason: dto.reason,
          requestedBy: userId,
          idempotencyKey: key,
          createdAt: now,
          updatedAt: now,
        });
      },
    );
    if (refund.status === PaymentRefundStatus.REFUNDED) return refund;
    const payment = await this.dataSource
      .getRepository(ProjectPayment)
      .findOneByOrFail({ id: paymentId });
    if (!payment.providerPaymentId)
      throw new ConflictException('Payment has no provider payment ID');
    try {
      const providerRefund = await this.provider.refund(
        payment.providerPaymentId,
        payment.amount,
        key,
      );
      const verified = await this.provider.getPayment(
        payment.providerPaymentId,
      );
      if (
        verified.status !== PaymentStatus.REFUNDED ||
        compareMoney(
          parseMoney(verified.refundedAmount),
          parseMoney(payment.amount),
        ) !== 0 ||
        verified.currency.toUpperCase() !== payment.currency
      )
        throw new ConflictException(
          'Provider has not confirmed the full refund',
        );
      await this.dataSource.transaction(async (manager) => {
        const lockedRefund = await manager
          .getRepository(PaymentRefund)
          .findOne({
            where: { id: refund.id },
            lock: { mode: 'pessimistic_write' },
          });
        const lockedPayment = await manager
          .getRepository(ProjectPayment)
          .findOne({
            where: { id: payment.id },
            lock: { mode: 'pessimistic_write' },
          });
        if (!lockedRefund || !lockedPayment)
          throw new NotFoundException('Refund operation not found');
        if (lockedRefund.status === PaymentRefundStatus.REFUNDED) return;
        await this.applyRefundState(manager, lockedPayment);
        lockedRefund.providerRefundId = providerRefund.id;
        lockedRefund.status = PaymentRefundStatus.REFUNDED;
        lockedRefund.updatedAt = new Date();
        await manager.getRepository(PaymentRefund).save(lockedRefund);
        Object.assign(refund, lockedRefund);
      });
      const project = await this.projectForPayment(
        this.dataSource.manager,
        payment,
      );
      payment.status = PaymentStatus.REFUNDED;
      await this.notifyPaymentState(project, payment);
      return refund;
    } catch (error) {
      await this.dataSource.getRepository(PaymentRefund).update(refund.id, {
        status: PaymentRefundStatus.FAILED,
        updatedAt: new Date(),
      });
      if (error instanceof PaymentProviderError)
        this.rethrowProviderError(error);
      throw error;
    }
  }

  private async applyRefundState(
    manager: EntityManager,
    payment: ProjectPayment,
  ): Promise<void> {
    const plan = await manager.getRepository(ProjectPaymentPlan).findOne({
      where: { id: payment.paymentPlanId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!plan) throw new NotFoundException('Payment plan not found');
    payment.status = PaymentStatus.REFUNDED;
    payment.providerStatus = 'refunded';
    payment.updatedAt = new Date();
    plan.fundedAmount = formatMoney(
      subtractMoney(parseMoney(plan.fundedAmount), parseMoney(payment.amount)),
    );
    plan.updatedAt = new Date();
    const distributions = await manager
      .getRepository(PaymentDistribution)
      .find({
        where: {
          paymentId: payment.id,
          type: PaymentDistributionType.PARTICIPANT_SHARE,
        },
      });
    for (const distribution of distributions) {
      if (!distribution.recipientUserId || !distribution.walletId) continue;
      const exists = await manager.getRepository(WalletLedgerEntry).findOneBy({
        idempotencyKey: `payment:${payment.id}:distribution:${distribution.id}:refund`,
      });
      if (!exists) {
        await manager.getRepository(WalletLedgerEntry).save({
          id: randomUUID(),
          walletId: distribution.walletId,
          paymentDistributionId: distribution.id,
          bucket: LedgerBalanceBucket.HELD,
          direction: LedgerEntryDirection.DEBIT,
          type: LedgerEntryType.PAYMENT_REVERSAL,
          amount: distribution.amount,
          currency: distribution.currency,
          idempotencyKey: `payment:${payment.id}:distribution:${distribution.id}:refund`,
          description: 'Reversión por reembolso de pago',
          metadata: { paymentId: payment.id },
          createdAt: new Date(),
        });
      }
    }
    if (payment.installmentId) {
      const installment = await manager
        .getRepository(PaymentPlanInstallment)
        .findOne({
          where: { id: payment.installmentId },
          lock: { mode: 'pessimistic_write' },
        });
      if (installment) {
        installment.status = PaymentInstallmentStatus.REFUNDED;
        installment.paidAt = null;
        installment.updatedAt = new Date();
        await manager.getRepository(PaymentPlanInstallment).save(installment);
      }
    }
    await manager.getRepository(ProjectPaymentPlan).save(plan);
    await manager.getRepository(ProjectPayment).save(payment);
  }

  private installmentStatus(status: PaymentStatus): PaymentInstallmentStatus {
    switch (status) {
      case PaymentStatus.SUCCEEDED:
        return PaymentInstallmentStatus.PAID;
      case PaymentStatus.REFUNDED:
        return PaymentInstallmentStatus.REFUNDED;
      case PaymentStatus.CANCELLED:
      case PaymentStatus.FAILED:
        return PaymentInstallmentStatus.PENDING;
      case PaymentStatus.PENDING:
      case PaymentStatus.PROCESSING:
        return PaymentInstallmentStatus.PROCESSING;
    }
  }

  async releaseProjectFunds(
    projectId: string,
    requesterId: string,
  ): Promise<ProjectPaymentPlan | null> {
    if (this.config.get<boolean>('FINANCIAL_FEATURE_ENABLED') !== true)
      return null;
    const result = await this.dataSource.transaction(
      'SERIALIZABLE',
      async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `payment-release:${projectId}`,
        ]);
        const project = await manager.getRepository(Project).findOne({
          where: { id: projectId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!project) throw new NotFoundException('Project not found');
        if (project.requesterId !== requesterId)
          throw new ForbiddenException(
            'Only the project requester can release funds',
          );
        const plan = await manager.getRepository(ProjectPaymentPlan).findOne({
          where: {
            projectId,
            status: In([PaymentPlanStatus.ACTIVE, PaymentPlanStatus.COMPLETED]),
          },
          order: { version: 'DESC' },
          lock: { mode: 'pessimistic_write' },
        });
        if (!plan)
          throw new ConflictException('Project has no active payment plan');
        if (
          compareMoney(
            parseMoney(plan.fundedAmount),
            parseMoney(plan.totalAmount),
          ) !== 0
        )
          throw new ConflictException(
            'The payment plan must be fully funded before closing the project',
          );
        if (
          compareMoney(
            parseMoney(plan.releasedAmount),
            parseMoney(plan.totalAmount),
          ) === 0
        )
          return { plan, project, released: false };
        const installments = await manager
          .getRepository(PaymentPlanInstallment)
          .find({ where: { paymentPlanId: plan.id } });
        if (
          installments.some(
            (item) => item.status !== PaymentInstallmentStatus.PAID,
          )
        )
          throw new ConflictException(
            'Every payment installment must be paid before closing the project',
          );
        const payments = await manager.getRepository(ProjectPayment).find({
          where: {
            paymentPlanId: plan.id,
            status: PaymentStatus.SUCCEEDED,
          },
        });
        const distributions = payments.length
          ? await manager.getRepository(PaymentDistribution).find({
              where: {
                paymentId: In(payments.map((payment) => payment.id)),
                type: PaymentDistributionType.PARTICIPANT_SHARE,
              },
            })
          : [];
        for (const distribution of distributions) {
          if (!distribution.walletId || !distribution.recipientUserId) continue;
          const releaseKey = `distribution:${distribution.id}:release`;
          const releasedEntry = await manager
            .getRepository(WalletLedgerEntry)
            .findOneBy({ idempotencyKey: `${releaseKey}:credit` });
          if (releasedEntry) continue;
          await manager.getRepository(WalletLedgerEntry).save([
            {
              id: randomUUID(),
              walletId: distribution.walletId,
              paymentDistributionId: distribution.id,
              bucket: LedgerBalanceBucket.HELD,
              direction: LedgerEntryDirection.DEBIT,
              type: LedgerEntryType.PAYMENT_DISTRIBUTION,
              amount: distribution.amount,
              currency: distribution.currency,
              idempotencyKey: `${releaseKey}:debit`,
              description: 'Fondos liberados tras validar la entrega',
              metadata: { projectId, paymentId: distribution.paymentId },
              createdAt: new Date(),
            },
            {
              id: randomUUID(),
              walletId: distribution.walletId,
              paymentDistributionId: distribution.id,
              bucket: LedgerBalanceBucket.AVAILABLE,
              direction: LedgerEntryDirection.CREDIT,
              type: LedgerEntryType.PAYMENT_DISTRIBUTION,
              amount: distribution.amount,
              currency: distribution.currency,
              idempotencyKey: `${releaseKey}:credit`,
              description: 'Fondos disponibles por entrega validada',
              metadata: { projectId, paymentId: distribution.paymentId },
              createdAt: new Date(),
            },
          ]);
        }
        plan.releasedAmount = plan.totalAmount;
        plan.status = PaymentPlanStatus.COMPLETED;
        plan.completedAt = new Date();
        plan.updatedAt = new Date();
        await manager.getRepository(ProjectPaymentPlan).save(plan);
        return { plan, project, released: true };
      },
    );
    if (result.released) {
      await this.notifications.createForUsersSafely(result.project.solverIds, {
        type: NotificationType.FUNDS_RELEASED,
        title: 'Fondos liberados',
        message:
          'La entrega fue validada y los fondos ya están disponibles en tu billetera.',
        href: '/wallet',
      });
    }
    return result.plan;
  }

  private async distributeSuccessfulPayment(
    manager: EntityManager,
    payment: ProjectPayment,
    plan: ProjectPaymentPlan,
  ): Promise<void> {
    const existing = await manager
      .getRepository(PaymentDistribution)
      .countBy({ paymentId: payment.id });
    if (existing > 0) return;
    const [shares, feeConfig] = await Promise.all([
      manager.getRepository(ProjectParticipantShare).find({
        where: { paymentPlanId: plan.id },
        order: { userId: 'ASC' },
      }),
      manager
        .getRepository(MarketplaceFeeConfig)
        .findOneBy({ id: plan.feeConfigId }),
    ]);
    if (!shares.length)
      throw new ConflictException('Payment plan has no participant shares');
    if (!feeConfig)
      throw new ConflictException('Payment plan fee configuration is missing');
    const gross = parseMoney(payment.amount);
    const proportionalFee = multiplyByBasisPoints(
      gross,
      feeConfig.feeBasisPoints,
    );
    const configuredFixedFee = parseMoney(feeConfig.fixedFeeAmount);
    const fee =
      proportionalFee + configuredFixedFee < gross
        ? proportionalFee + configuredFixedFee
        : proportionalFee;
    const net = subtractMoney(gross, fee);
    const allocations = allocateByBasisPoints(
      net,
      shares.map((share) => share.shareBasisPoints),
    );
    const now = new Date();
    if (fee > 0n) {
      await manager.getRepository(PaymentDistribution).save({
        id: randomUUID(),
        paymentId: payment.id,
        participantShareId: null,
        recipientUserId: null,
        walletId: null,
        type: PaymentDistributionType.MARKETPLACE_FEE,
        amount: formatMoney(fee),
        currency: payment.currency,
        idempotencyKey: `payment:${payment.id}:marketplace-fee`,
        createdAt: now,
      });
    }
    for (const [index, share] of shares.entries()) {
      let wallet = await manager.getRepository(Wallet).findOneBy({
        userId: share.userId,
        currency: payment.currency,
      });
      if (!wallet) {
        wallet = await manager.getRepository(Wallet).save(
          manager.getRepository(Wallet).create({
            id: randomUUID(),
            userId: share.userId,
            currency: payment.currency,
            status: WalletStatus.ACTIVE,
            createdAt: now,
            updatedAt: now,
          }),
        );
      }
      const distribution = await manager
        .getRepository(PaymentDistribution)
        .save({
          id: randomUUID(),
          paymentId: payment.id,
          participantShareId: share.id,
          recipientUserId: share.userId,
          walletId: wallet.id,
          type: PaymentDistributionType.PARTICIPANT_SHARE,
          amount: formatMoney(allocations[index]),
          currency: payment.currency,
          idempotencyKey: `payment:${payment.id}:share:${share.id}`,
          createdAt: now,
        });
      await manager.getRepository(WalletLedgerEntry).save({
        id: randomUUID(),
        walletId: wallet.id,
        paymentDistributionId: distribution.id,
        bucket: LedgerBalanceBucket.HELD,
        direction: LedgerEntryDirection.CREDIT,
        type: LedgerEntryType.PAYMENT_DISTRIBUTION,
        amount: distribution.amount,
        currency: distribution.currency,
        idempotencyKey: `payment:${payment.id}:share:${share.id}:held`,
        description: 'Pago retenido hasta la validación de la entrega',
        metadata: { paymentId: payment.id, paymentPlanId: plan.id },
        createdAt: now,
      });
    }
  }

  private async notifyPaymentState(
    project: Project | null,
    payment: ProjectPayment,
  ): Promise<void> {
    if (!project) return;
    const presentation =
      payment.status === PaymentStatus.SUCCEEDED
        ? {
            type: NotificationType.PAYMENT_APPROVED,
            title: 'Pago aprobado',
            message: 'El pago de una cuota fue aprobado.',
          }
        : payment.status === PaymentStatus.REFUNDED
          ? {
              type: NotificationType.PAYMENT_REFUNDED,
              title: 'Pago reembolsado',
              message: 'El pago fue reembolsado completamente.',
            }
          : [PaymentStatus.FAILED, PaymentStatus.CANCELLED].includes(
                payment.status,
              )
            ? {
                type: NotificationType.PAYMENT_FAILED,
                title: 'Pago no aprobado',
                message: 'El proveedor no aprobó el pago de la cuota.',
              }
            : null;
    if (!presentation) return;
    await this.notifications.createForUsersSafely(project.participantIds, {
      ...presentation,
      href: `/projects/${project.id}`,
    });
  }

  private async assertPaymentParticipant(
    userId: string,
    projectId: string,
    payment: ProjectPayment,
  ): Promise<void> {
    const project = await this.projectForPayment(
      this.dataSource.manager,
      payment,
    );
    if (project.id !== projectId)
      throw new NotFoundException('Payment not found');
    if (!project.participantIds.includes(userId))
      throw new ForbiddenException('User is not a project participant');
  }

  private async projectForPayment(
    manager: EntityManager,
    payment: ProjectPayment,
  ): Promise<Project> {
    const plan = await manager
      .getRepository(ProjectPaymentPlan)
      .findOneBy({ id: payment.paymentPlanId });
    if (!plan) throw new NotFoundException('Payment plan not found');
    const project = await manager
      .getRepository(Project)
      .findOneBy({ id: plan.projectId });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private requireIdempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key || key.length > 160)
      throw new ConflictException('A valid Idempotency-Key header is required');
    return key;
  }

  private assertEnabled(): void {
    if (!this.config.getOrThrow<boolean>('FINANCIAL_FEATURE_ENABLED'))
      throw new ServiceUnavailableException('Financial feature is disabled');
  }

  private rethrowProviderError(error: unknown): never {
    if (error instanceof PaymentProviderError)
      throw new ServiceUnavailableException({
        message: 'Payment provider operation failed',
        code: error.code,
        retryable: error.retryable,
      });
    throw error;
  }
}
