import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { parseMoney, formatMoney } from '../../common/money';
import {
  WithdrawalStatus,
  LedgerBalanceBucket,
  LedgerEntryDirection,
  LedgerEntryType,
  NotificationType,
} from '../../shared';
import { WithdrawalRequest } from './entities/withdrawal-request.entity';
import { WalletsService } from '../wallets/wallets.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateWithdrawalDto,
  ReviewWithdrawalDto,
  MarkWithdrawalPaidDto,
  WithdrawalDto,
} from './dto/withdrawal.dto';

@Injectable()
export class WithdrawalsService {
  constructor(
    @InjectRepository(WithdrawalRequest)
    private readonly withdrawals: Repository<WithdrawalRequest>,
    private readonly wallets: WalletsService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  private assertEnabled(): void {
    if (!this.config.get<boolean>('FINANCIAL_FEATURE_ENABLED')) {
      throw new BadRequestException('Financial features are not enabled');
    }
  }

  async create(
    userId: string,
    dto: CreateWithdrawalDto,
    idempotencyKey?: string,
  ): Promise<WithdrawalDto> {
    this.assertEnabled();

    // Validate amount
    const amount = parseMoney(dto.amount);
    if (amount <= BigInt(0)) {
      throw new BadRequestException('Amount must be positive');
    }

    // Get or create wallet
    const wallet = await this.wallets.findOrCreateWallet(
      userId,
      dto.currency,
    );

    // Check available balance
    const balance = await this.wallets.calculateBalance(wallet.id);
    if (parseMoney(balance.available) < amount) {
      throw new BadRequestException('Insufficient available balance');
    }

    // Create withdrawal request
    const withdrawal = this.withdrawals.create({
      id: crypto.randomUUID(),
      walletId: wallet.id,
      userId,
      amount: formatMoney(amount),
      currency: dto.currency,
      status: WithdrawalStatus.PENDING_REVIEW,
      destinationType: dto.destinationType,
      destinationReference: dto.destinationReference,
      idempotencyKey: idempotencyKey ?? crypto.randomUUID(),
      requestedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    try {
      await this.withdrawals.save(withdrawal);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === '23505'
      ) {
        // Duplicate idempotency key
        const existing = await this.withdrawals.findOne({
          where: { idempotencyKey: idempotencyKey ?? '' },
        });
        if (existing) return this.toDto(existing);
      }
      throw error;
    }

    // Reserve funds by moving from available to held
    await this.wallets.moveFunds({
      userId,
      currency: dto.currency,
      fromBucket: LedgerBalanceBucket.AVAILABLE,
      toBucket: LedgerBalanceBucket.HELD,
      amount: formatMoney(amount),
      type: LedgerEntryType.WITHDRAWAL_RESERVE,
      idempotencyKey: `withdrawal-${withdrawal.id}-reserve`,
      description: `Withdrawal request ${withdrawal.id}`,
      metadata: { withdrawalId: withdrawal.id },
    });

    // Notify user
    await this.notifications.create({
      userId,
      type: NotificationType.WITHDRAWAL_REQUESTED,
      title: 'Withdrawal Requested',
      message: `Your withdrawal of ${dto.amount} ${dto.currency} is pending review`,
      metadata: { withdrawalId: withdrawal.id },
    });

    return this.toDto(withdrawal);
  }

  async findOne(userId: string, id: string): Promise<WithdrawalDto> {
    const withdrawal = await this.withdrawals.findOne({ where: { id } });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }
    if (withdrawal.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return this.toDto(withdrawal);
  }

  async findMine(
    userId: string,
    status?: WithdrawalStatus,
    limit = 50,
    offset = 0,
  ): Promise<{ withdrawals: WithdrawalDto[]; total: number }> {
    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;

    const [withdrawals, total] = await this.withdrawals.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      withdrawals: withdrawals.map((w) => this.toDto(w)),
      total,
    };
  }

  async findAll(
    status?: WithdrawalStatus,
    limit = 50,
    offset = 0,
  ): Promise<{ withdrawals: WithdrawalDto[]; total: number }> {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const [withdrawals, total] = await this.withdrawals.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      withdrawals: withdrawals.map((w) => this.toDto(w)),
      total,
    };
  }

  async review(
    adminUserId: string,
    id: string,
    dto: ReviewWithdrawalDto,
  ): Promise<WithdrawalDto> {
    this.assertEnabled();

    const withdrawal = await this.withdrawals.findOne({ where: { id } });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }

    if (withdrawal.status !== WithdrawalStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        `Withdrawal is not pending review (current status: ${withdrawal.status})`,
      );
    }

    if (dto.decision === 'approved') {
      withdrawal.status = WithdrawalStatus.APPROVED;
      withdrawal.reviewedAt = new Date();
      withdrawal.updatedAt = new Date();

      await this.withdrawals.save(withdrawal);

      // Notify user
      await this.notifications.create({
        userId: withdrawal.userId,
        type: NotificationType.WITHDRAWAL_APPROVED,
        title: 'Withdrawal Approved',
        message: `Your withdrawal of ${withdrawal.amount} ${withdrawal.currency} has been approved`,
        metadata: { withdrawalId: withdrawal.id },
      });
    } else {
      withdrawal.status = WithdrawalStatus.REJECTED;
      withdrawal.reviewedAt = new Date();
      withdrawal.failureReason = dto.failureReason ?? 'Rejected by admin';
      withdrawal.updatedAt = new Date();

      await this.withdrawals.save(withdrawal);

      // Return funds to available
      await this.wallets.moveFunds({
        userId: withdrawal.userId,
        currency: withdrawal.currency,
        fromBucket: LedgerBalanceBucket.HELD,
        toBucket: LedgerBalanceBucket.AVAILABLE,
        amount: withdrawal.amount,
        type: LedgerEntryType.WITHDRAWAL_CANCELLED,
        idempotencyKey: `withdrawal-${withdrawal.id}-reject`,
        description: `Withdrawal ${withdrawal.id} rejected`,
        metadata: { withdrawalId: withdrawal.id },
      });

      // Notify user
      await this.notifications.create({
        userId: withdrawal.userId,
        type: NotificationType.WITHDRAWAL_REJECTED,
        title: 'Withdrawal Rejected',
        message: `Your withdrawal request was rejected: ${withdrawal.failureReason}`,
        metadata: { withdrawalId: withdrawal.id },
      });
    }

    return this.toDto(withdrawal);
  }

  async markPaid(
    adminUserId: string,
    id: string,
    dto: MarkWithdrawalPaidDto,
  ): Promise<WithdrawalDto> {
    this.assertEnabled();

    const withdrawal = await this.withdrawals.findOne({ where: { id } });
    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }

    if (withdrawal.status !== WithdrawalStatus.APPROVED) {
      throw new BadRequestException(
        `Withdrawal must be approved before marking as paid (current status: ${withdrawal.status})`,
      );
    }

    withdrawal.status = WithdrawalStatus.COMPLETED;
    withdrawal.processedAt = new Date();
    withdrawal.updatedAt = new Date();

    await this.withdrawals.save(withdrawal);

    // Deduct from held bucket (funds are now gone)
    await this.wallets.addLedgerEntry({
      userId: withdrawal.userId,
      currency: withdrawal.currency,
      bucket: LedgerBalanceBucket.HELD,
      direction: LedgerEntryDirection.DEBIT,
      type: LedgerEntryType.WITHDRAWAL,
      amount: withdrawal.amount,
      idempotencyKey: `withdrawal-${withdrawal.id}-complete`,
      description: `Withdrawal ${withdrawal.id} completed`,
      metadata: {
        withdrawalId: withdrawal.id,
        externalReference: dto.externalReference,
      },
    });

    // Notify user
    await this.notifications.create({
      userId: withdrawal.userId,
      type: NotificationType.WITHDRAWAL_COMPLETED,
      title: 'Withdrawal Completed',
      message: `Your withdrawal of ${withdrawal.amount} ${withdrawal.currency} has been processed`,
      metadata: { withdrawalId: withdrawal.id },
    });

    return this.toDto(withdrawal);
  }

  private toDto(withdrawal: WithdrawalRequest): WithdrawalDto {
    return {
      id: withdrawal.id,
      userId: withdrawal.userId,
      walletId: withdrawal.walletId,
      amount: withdrawal.amount,
      currency: withdrawal.currency,
      status: withdrawal.status,
      destinationType: withdrawal.destinationType,
      destinationReference: withdrawal.destinationReference,
      failureReason: withdrawal.failureReason,
      requestedAt: withdrawal.requestedAt,
      reviewedAt: withdrawal.reviewedAt,
      processedAt: withdrawal.processedAt,
      createdAt: withdrawal.createdAt,
      updatedAt: withdrawal.updatedAt,
    };
  }
}
