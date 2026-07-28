import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThan,
} from 'typeorm';
import {
  allocateByBasisPoints,
  compareMoney,
  formatMoney,
  parseMoney,
} from '../../common/money';
import {
  ParticipantShareAcceptanceStatus,
  JobStatus,
  PaymentInstallmentStatus,
  PaymentPlanStatus,
  ProblemStatus,
} from '../../shared';
import { MarketplaceFeeConfig } from '../marketplace-fees/entities/marketplace-fee-config.entity';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Problem } from '../problems/entities/problem.entity';
import { Proposal } from '../proposals/entities/proposal.entity';
import { Project } from '../projects/entities/project.entity';
import {
  AcceptPaymentPlanShareDto,
  CreatePaymentPlanDto,
  PaymentPlanShareDecision,
} from './dto/payment-plan.dto';
import { PaymentPlanInstallment } from './entities/payment-plan-installment.entity';
import { ProjectParticipantShare } from './entities/project-participant-share.entity';
import { ProjectPaymentPlan } from './entities/project-payment-plan.entity';

export type PaymentPlanView = ProjectPaymentPlan & {
  installments: PaymentPlanInstallment[];
  shares: ProjectParticipantShare[];
};

@Injectable()
export class PaymentPlansService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  async current(userId: string, projectId: string): Promise<PaymentPlanView> {
    return this.dataSource.transaction(async (manager) => {
      const project = await manager
        .getRepository(Project)
        .findOneBy({ id: projectId });
      if (!project) throw new NotFoundException('Project not found');
      this.assertParticipant(project, userId);
      const plans = await manager.getRepository(ProjectPaymentPlan).find({
        where: {
          projectId,
          status: In([
            PaymentPlanStatus.PENDING_ACCEPTANCE,
            PaymentPlanStatus.ACTIVE,
            PaymentPlanStatus.COMPLETED,
          ]),
        },
        order: { version: 'DESC' },
      });
      if (!plans.length) throw new NotFoundException('No current payment plan');
      if (plans.length !== 1)
        throw new ConflictException(
          'Expected exactly one current payment plan',
        );
      return this.view(manager, plans[0]);
    });
  }

  async ensureForAcceptedProject(
    requesterId: string,
    projectId: string,
  ): Promise<PaymentPlanView> {
    const existing = await this.dataSource
      .getRepository(ProjectPaymentPlan)
      .findOne({
        where: {
          projectId,
          status: In([
            PaymentPlanStatus.PENDING_ACCEPTANCE,
            PaymentPlanStatus.ACTIVE,
          ]),
        },
        order: { version: 'DESC' },
      });
    if (existing) return this.view(this.dataSource.manager, existing);

    const project = await this.dataSource
      .getRepository(Project)
      .findOneBy({ id: projectId });
    if (!project) throw new NotFoundException('Project not found');
    if (project.requesterId !== requesterId)
      throw new ForbiddenException(
        'Only the project requester can initialize its payment plan',
      );
    const solverIds = [...new Set(project.solverIds)].sort();
    if (!solverIds.length)
      throw new ConflictException(
        'The project requires at least one solver share',
      );
    const shares = this.defaultShares(project, solverIds);
    const lastDueDate = project.deliverySchedule
      .map((item) => new Date(item.dueDate))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((left, right) => right.getTime() - left.getTime())[0];
    const dueAt =
      lastDueDate && lastDueDate > new Date()
        ? lastDueDate
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return this.create(requesterId, projectId, {
      confirmed: true,
      installments: [
        {
          allocationBasisPoints: 10_000,
          description: 'Pago total acordado para el proyecto',
          dueAt: dueAt.toISOString(),
        },
      ],
      shares,
    });
  }

  async create(
    userId: string,
    projectId: string,
    dto: CreatePaymentPlanDto,
  ): Promise<PaymentPlanView> {
    const result = await this.dataSource.transaction(
      'SERIALIZABLE',
      async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `payment-plan:${projectId}`,
        ]);
        const project = await manager.getRepository(Project).findOne({
          where: { id: projectId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!project) throw new NotFoundException('Project not found');
        await this.restoreLegacyBudget(manager, project);
        const leadId = project.leadSolverId ?? project.solverIds[0];
        if (userId !== project.requesterId && userId !== leadId)
          throw new ForbiddenException(
            'Only requester or solver lead can create a payment plan',
          );

        const totalAmount = parseMoney(String(project.totalPrice ?? ''));
        if (totalAmount === 0n)
          throw new ConflictException(
            'Project total price must be greater than zero',
          );
        const currency = project.currency?.toUpperCase();
        if (!currency || !/^[A-Z]{3}$/.test(currency))
          throw new ConflictException(
            'Project currency must be a valid ISO code',
          );
        this.validateAllocations(dto, project);

        const planRepository = manager.getRepository(ProjectPaymentPlan);
        const versions = await planRepository.find({
          where: { projectId },
          order: { version: 'DESC' },
          lock: { mode: 'pessimistic_write' },
        });
        const currentPlans = versions.filter((plan) =>
          [
            PaymentPlanStatus.DRAFT,
            PaymentPlanStatus.PENDING_ACCEPTANCE,
            PaymentPlanStatus.ACTIVE,
          ].includes(plan.status),
        );
        if (
          currentPlans.some(
            (plan) =>
              plan.status === PaymentPlanStatus.ACTIVE &&
              compareMoney(parseMoney(plan.fundedAmount), 0n) !== 0,
          )
        ) {
          throw new ConflictException(
            'A funded active payment plan cannot be replaced',
          );
        }
        const now = new Date();
        for (const plan of currentPlans) {
          plan.status = PaymentPlanStatus.SUPERSEDED;
          plan.updatedAt = now;
        }
        if (currentPlans.length) await planRepository.save(currentPlans);

        const feeConfig = await this.currentFee(manager, currency, now);
        const plan = await planRepository.save(
          planRepository.create({
            id: randomUUID(),
            projectId,
            version: (versions[0]?.version ?? 0) + 1,
            createdBy: userId,
            feeConfigId: feeConfig.id,
            status: PaymentPlanStatus.PENDING_ACCEPTANCE,
            currency,
            totalAmount: formatMoney(totalAmount),
            fundedAmount: formatMoney(0n),
            releasedAmount: formatMoney(0n),
            activatedAt: null,
            completedAt: null,
            createdAt: now,
            updatedAt: now,
          }),
        );
        const installmentAmounts = allocateByBasisPoints(
          totalAmount,
          dto.installments.map((item) => item.allocationBasisPoints),
        );
        if (installmentAmounts.some((amount) => amount === 0n))
          throw new ConflictException(
            'Every installment must allocate at least 0.0001',
          );
        const installments = dto.installments.map((item, index) =>
          manager.getRepository(PaymentPlanInstallment).create({
            id: randomUUID(),
            paymentPlanId: plan.id,
            sequence: index + 1,
            allocationBasisPoints: item.allocationBasisPoints,
            description: item.description.trim(),
            amount: formatMoney(installmentAmounts[index]),
            status: PaymentInstallmentStatus.PENDING,
            dueAt: new Date(item.dueAt),
            paidAt: null,
            createdAt: now,
            updatedAt: now,
          }),
        );
        const shareAmounts = allocateByBasisPoints(
          totalAmount,
          dto.shares.map((item) => item.shareBasisPoints),
        );
        const shares = dto.shares.map((item, index) =>
          manager.getRepository(ProjectParticipantShare).create({
            id: randomUUID(),
            paymentPlanId: plan.id,
            userId: item.userId,
            shareBasisPoints: item.shareBasisPoints,
            amount: formatMoney(shareAmounts[index]),
            acceptanceStatus: ParticipantShareAcceptanceStatus.PENDING,
            respondedAt: null,
            createdAt: now,
            updatedAt: now,
          }),
        );
        await manager.getRepository(PaymentPlanInstallment).save(installments);
        await manager.getRepository(ProjectParticipantShare).save(shares);
        return {
          view: Object.assign(plan, { installments, shares }),
          notificationUserIds: [project.requesterId, ...project.solverIds],
        };
      },
    );

    await this.notifications.createForUsersSafely(result.notificationUserIds, {
      type: NotificationType.PAYMENT_PLAN_ACCEPTANCE_REQUIRED,
      title: 'Plan de pagos por aceptar',
      message:
        'Revisa y acepta tu participación en el plan de pagos del proyecto.',
      href: `/projects/${projectId}/payments`,
    });
    return result.view;
  }

  async acceptShare(
    userId: string,
    projectId: string,
    planId: string,
    dto: AcceptPaymentPlanShareDto,
  ): Promise<PaymentPlanView> {
    const result = await this.dataSource.transaction(
      'SERIALIZABLE',
      async (manager) => {
        const plan = await manager.getRepository(ProjectPaymentPlan).findOne({
          where: { id: planId, projectId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!plan) throw new NotFoundException('Payment plan not found');
        if (plan.status !== PaymentPlanStatus.PENDING_ACCEPTANCE)
          throw new ConflictException('Payment plan is not pending acceptance');
        const project = await manager.getRepository(Project).findOne({
          where: { id: projectId },
          lock: { mode: 'pessimistic_read' },
        });
        if (!project) throw new NotFoundException('Project not found');
        if (!project.solverIds.includes(userId))
          throw new ForbiddenException('Only a current solver can respond');
        const shares = await manager
          .getRepository(ProjectParticipantShare)
          .find({
            where: { paymentPlanId: plan.id },
            order: { userId: 'ASC' },
            lock: { mode: 'pessimistic_write' },
          });
        const ownShare = shares.find((share) => share.userId === userId);
        if (!ownShare)
          throw new ForbiddenException(
            'Payment plan share does not belong to user',
          );
        if (
          ownShare.acceptanceStatus !== ParticipantShareAcceptanceStatus.PENDING
        )
          throw new ConflictException(
            'Payment plan share was already answered',
          );
        const now = new Date();
        const rejected = dto.decision === PaymentPlanShareDecision.REJECTED;
        ownShare.acceptanceStatus = rejected
          ? ParticipantShareAcceptanceStatus.REJECTED
          : ParticipantShareAcceptanceStatus.ACCEPTED;
        ownShare.respondedAt = now;
        ownShare.updatedAt = now;
        await manager.getRepository(ProjectParticipantShare).save(ownShare);
        if (rejected) {
          plan.status = PaymentPlanStatus.CANCELLED;
        } else if (
          shares.every(
            (share) =>
              share.id === ownShare.id ||
              share.acceptanceStatus ===
                ParticipantShareAcceptanceStatus.ACCEPTED,
          )
        ) {
          plan.status = PaymentPlanStatus.ACTIVE;
          plan.activatedAt = now;
          if (project.status === JobStatus.PENDING_PAYMENT_PLAN) {
            project.status = JobStatus.ACTIVE;
            project.updatedAt = now.toISOString();
            await manager.getRepository(Project).save(project);
            await manager.getRepository(Problem).update(project.problemId, {
              status: ProblemStatus.IN_EXECUTION,
              updatedAt: now.toISOString(),
            });
          }
        }
        plan.updatedAt = now;
        await manager.getRepository(ProjectPaymentPlan).save(plan);
        return { view: await this.view(manager, plan), project, rejected };
      },
    );

    await this.notifications.createForUsersSafely(
      [result.project.requesterId, ...result.project.solverIds],
      {
        type: result.rejected
          ? NotificationType.PAYMENT_PLAN_REJECTED
          : result.view.status === PaymentPlanStatus.ACTIVE
            ? NotificationType.PAYMENT_PLAN_ACTIVATED
            : NotificationType.PAYMENT_PLAN_SHARE_ACCEPTED,
        title: result.rejected
          ? 'Plan de pagos rechazado'
          : result.view.status === PaymentPlanStatus.ACTIVE
            ? 'Plan de pagos activo'
            : 'Participación del plan aceptada',
        message: result.rejected
          ? 'Un solucionador rechazó el plan de pagos; deberá crearse una nueva versión.'
          : result.view.status === PaymentPlanStatus.ACTIVE
            ? 'Todos los solucionadores aceptaron el plan de pagos.'
            : 'Un solucionador aceptó su participación en el plan de pagos.',
        href: `/projects/${projectId}/payments`,
      },
      userId,
    );
    return result.view;
  }

  private validateAllocations(
    dto: CreatePaymentPlanDto,
    project: Project,
  ): void {
    const installmentTotal = dto.installments.reduce(
      (total, item) => total + item.allocationBasisPoints,
      0,
    );
    if (installmentTotal !== 10_000)
      throw new ConflictException('Installment basis points must sum to 10000');
    const shareTotal = dto.shares.reduce(
      (total, item) => total + item.shareBasisPoints,
      0,
    );
    if (shareTotal !== 10_000)
      throw new ConflictException('Share basis points must sum to 10000');
    const userIds = dto.shares.map((share) => share.userId);
    if (new Set(userIds).size !== userIds.length)
      throw new ConflictException('Participant share user IDs must be unique');
    const expected = [...new Set(project.solverIds)].sort();
    const provided = [...userIds].sort();
    if (
      expected.length !== provided.length ||
      expected.some((userId, index) => userId !== provided[index])
    ) {
      throw new ConflictException(
        'Shares must match the current project solvers exactly',
      );
    }
  }

  private defaultShares(
    project: Project,
    solverIds: string[],
  ): Array<{ userId: string; shareBasisPoints: number }> {
    const configured = solverIds.map((userId) =>
      Math.round(Number(project.memberShares?.[userId] ?? 0) * 100),
    );
    const configuredTotal = configured.reduce(
      (total, value) => total + value,
      0,
    );
    const basisPoints =
      configured.every((value) => value > 0) && configuredTotal === 10_000
        ? configured
        : solverIds.map((_, index) => {
            const base = Math.floor(10_000 / solverIds.length);
            return base + (index < 10_000 % solverIds.length ? 1 : 0);
          });
    return solverIds.map((userId, index) => ({
      userId,
      shareBasisPoints: basisPoints[index],
    }));
  }

  private async currentFee(
    manager: EntityManager,
    currency: string,
    at: Date,
  ): Promise<MarketplaceFeeConfig> {
    const configs = await manager.getRepository(MarketplaceFeeConfig).find({
      where: [
        {
          currency,
          effectiveFrom: LessThanOrEqual(at),
          effectiveTo: MoreThan(at),
        },
        { currency, effectiveFrom: LessThanOrEqual(at), effectiveTo: IsNull() },
      ],
      lock: { mode: 'pessimistic_read' },
    });
    if (configs.length !== 1)
      throw new ConflictException(
        'Exactly one current fee configuration is required',
      );
    return configs[0];
  }

  private async restoreLegacyBudget(
    manager: EntityManager,
    project: Project,
  ): Promise<void> {
    if (
      Number(project.totalPrice ?? 0) > 0 &&
      /^[A-Z]{3}$/.test(project.currency ?? '')
    )
      return;
    const proposal = await manager
      .getRepository(Proposal)
      .findOneBy({ id: project.proposalId });
    if (
      !proposal ||
      Number(proposal.price) <= 0 ||
      !/^[A-Z]{3}$/.test(proposal.currency?.toUpperCase() ?? '')
    )
      throw new ConflictException(
        'The accepted proposal must define a valid project price and currency',
      );
    project.totalPrice = Number(proposal.price);
    project.currency = proposal.currency.toUpperCase();
    project.updatedAt = new Date().toISOString();
    await manager.getRepository(Project).save(project);
  }

  private async view(
    manager: EntityManager,
    plan: ProjectPaymentPlan,
  ): Promise<PaymentPlanView> {
    const [installments, shares] = await Promise.all([
      manager.getRepository(PaymentPlanInstallment).find({
        where: { paymentPlanId: plan.id },
        order: { sequence: 'ASC' },
      }),
      manager.getRepository(ProjectParticipantShare).find({
        where: { paymentPlanId: plan.id },
        order: { userId: 'ASC' },
      }),
    ]);
    return Object.assign(plan, { installments, shares });
  }

  private assertParticipant(project: Project, userId: string): void {
    if (!project.participantIds.includes(userId))
      throw new ForbiddenException('User is not a project participant');
  }
}
