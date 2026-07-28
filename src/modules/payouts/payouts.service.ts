import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import {
  PaymentProvider,
  PaymentStatus,
  PayoutStatus,
  WithdrawalStatus,
} from '../../shared';
import { formatMoney, parseMoney } from '../../common/money';
import { ProjectPayment } from '../payments/entities/project-payment.entity';
import { WithdrawalRequest } from '../withdrawals/entities/withdrawal-request.entity';
import { WithdrawalsService } from '../withdrawals/withdrawals.service';
import { ProcessPayoutDto } from './dto/payout.dto';
import { Payout } from './entities/payout.entity';

@Injectable()
export class PayoutsService {
  constructor(
    @InjectRepository(Payout)
    private readonly payouts: Repository<Payout>,
    @InjectRepository(WithdrawalRequest)
    private readonly withdrawals: Repository<WithdrawalRequest>,
    private readonly withdrawalService: WithdrawalsService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<Payout[]> {
    return this.payouts.find({ order: { createdAt: 'DESC' } });
  }

  async process(
    adminUserId: string,
    withdrawalId: string,
    dto: ProcessPayoutDto,
  ): Promise<Payout> {
    if (this.config.get<boolean>('FINANCIAL_FEATURE_ENABLED') !== true)
      throw new ConflictException('Financial features are not enabled');
    const withdrawal = await this.withdrawals.findOneBy({ id: withdrawalId });
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (withdrawal.status !== WithdrawalStatus.APPROVED)
      throw new ConflictException(
        'Withdrawal must be approved before creating its payout',
      );
    const existing = await this.payouts.findOneBy({
      withdrawalRequestId: withdrawalId,
    });
    if (existing) return existing;
    const now = new Date();
    const payout: Payout = await this.payouts.save(
      this.payouts.create({
        id: randomUUID(),
        withdrawalRequestId: withdrawal.id,
        provider: PaymentProvider.MANUAL,
        providerPayoutId: dto.externalReference.trim(),
        idempotencyKey: `withdrawal:${withdrawal.id}:payout`,
        amount: withdrawal.amount,
        feeAmount: formatMoney(0n),
        netAmount: withdrawal.amount,
        currency: withdrawal.currency,
        status: PayoutStatus.PROCESSING,
        failureCode: null,
        failureMessage: null,
        paidAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
    try {
      await this.withdrawalService.markPaid(adminUserId, withdrawal.id, {
        externalReference: dto.externalReference.trim(),
      });
      payout.status = PayoutStatus.PAID;
      payout.paidAt = new Date();
      payout.updatedAt = new Date();
      return await this.payouts.save(payout);
    } catch (error) {
      payout.status = PayoutStatus.FAILED;
      payout.failureCode = 'withdrawal_completion_failed';
      payout.failureMessage =
        error instanceof Error ? error.message : 'Unknown payout failure';
      payout.updatedAt = new Date();
      await this.payouts.save(payout);
      throw error;
    }
  }

  async financeSummary(): Promise<{
    payments: { count: number; approvedByCurrency: Record<string, string> };
    withdrawals: Record<string, number>;
    payouts: Record<string, number>;
  }> {
    const [payments, withdrawals, payouts] = await Promise.all([
      this.dataSource.getRepository(ProjectPayment).find({
        where: { status: PaymentStatus.SUCCEEDED },
      }),
      this.withdrawals.find(),
      this.payouts.find(),
    ]);
    const countBy = <T extends { status: string }>(items: T[]) =>
      items.reduce<Record<string, number>>((result, item) => {
        result[item.status] = (result[item.status] ?? 0) + 1;
        return result;
      }, {});
    const approvedByCurrency = payments.reduce<Record<string, bigint>>(
      (result, payment) => {
        result[payment.currency] =
          (result[payment.currency] ?? 0n) + parseMoney(payment.amount);
        return result;
      },
      {},
    );
    return {
      payments: {
        count: payments.length,
        approvedByCurrency: Object.fromEntries(
          Object.entries(approvedByCurrency).map(([currency, amount]) => [
            currency,
            formatMoney(amount),
          ]),
        ),
      },
      withdrawals: countBy(withdrawals),
      payouts: countBy(payouts),
    };
  }
}
