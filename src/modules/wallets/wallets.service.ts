import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { formatMoney, parseMoney } from '../../common/money';
import {
  LedgerBalanceBucket,
  LedgerEntryDirection,
  LedgerEntryType,
  WalletStatus,
} from '../../shared';
import { Wallet } from './entities/wallet.entity';
import { WalletLedgerEntry } from './entities/wallet-ledger-entry.entity';
import { WalletBalanceDto, LedgerEntryDto, WalletDto } from './dto/wallet.dto';

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(Wallet)
    private readonly wallets: Repository<Wallet>,
    @InjectRepository(WalletLedgerEntry)
    private readonly ledger: Repository<WalletLedgerEntry>,
  ) {}

  async findOrCreateWallet(
    userId: string,
    currency: string,
  ): Promise<Wallet> {
    let wallet = await this.wallets.findOne({
      where: { userId, currency },
    });
    if (!wallet) {
      wallet = this.wallets.create({
        id: crypto.randomUUID(),
        userId,
        currency,
        status: WalletStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await this.wallets.save(wallet);
    }
    return wallet;
  }

  async getWalletWithBalance(
    userId: string,
    currency: string,
  ): Promise<WalletDto> {
    const wallet = await this.findOrCreateWallet(userId, currency);
    const balance = await this.calculateBalance(wallet.id);
    return {
      id: wallet.id,
      userId: wallet.userId,
      currency: wallet.currency,
      status: wallet.status,
      balance,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  }

  async calculateBalance(walletId: string): Promise<WalletBalanceDto> {
    const wallet = await this.wallets.findOne({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const entries = await this.ledger.find({ where: { walletId } });

    const buckets = {
      [LedgerBalanceBucket.AVAILABLE]: BigInt(0),
      [LedgerBalanceBucket.PENDING]: BigInt(0),
      [LedgerBalanceBucket.HELD]: BigInt(0),
    };

    for (const entry of entries) {
      const amount = parseMoney(entry.amount);
      const delta =
        entry.direction === LedgerEntryDirection.CREDIT ? amount : -amount;
      buckets[entry.bucket as LedgerBalanceBucket] += delta;
    }

    const available = formatMoney(buckets[LedgerBalanceBucket.AVAILABLE]);
    const pending = formatMoney(buckets[LedgerBalanceBucket.PENDING]);
    const held = formatMoney(buckets[LedgerBalanceBucket.HELD]);
    const total = formatMoney(
      buckets[LedgerBalanceBucket.AVAILABLE] +
        buckets[LedgerBalanceBucket.PENDING] +
        buckets[LedgerBalanceBucket.HELD],
    );

    return {
      userId: wallet.userId,
      currency: wallet.currency,
      total,
      available,
      pending,
      held,
    };
  }

  async getLedgerEntries(
    userId: string,
    currency: string,
    limit = 50,
    offset = 0,
  ): Promise<{ entries: LedgerEntryDto[]; total: number }> {
    const wallet = await this.findOrCreateWallet(userId, currency);
    const [entries, total] = await this.ledger.findAndCount({
      where: { walletId: wallet.id },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      entries: entries.map((e) => ({
        id: e.id,
        bucket: e.bucket,
        direction: e.direction,
        type: e.type,
        amount: e.amount,
        currency: e.currency,
        description: e.description,
        metadata: e.metadata,
        createdAt: e.createdAt,
      })),
      total,
    };
  }

  async addLedgerEntry(input: {
    userId: string;
    currency: string;
    bucket: LedgerBalanceBucket;
    direction: LedgerEntryDirection;
    type: LedgerEntryType;
    amount: string;
    idempotencyKey: string;
    description?: string;
    metadata?: Record<string, unknown>;
    paymentDistributionId?: string;
  }): Promise<WalletLedgerEntry> {
    const wallet = await this.findOrCreateWallet(input.userId, input.currency);

    // Validate amount
    const amountBigInt = parseMoney(input.amount);
    if (amountBigInt <= BigInt(0)) {
      throw new BadRequestException('Amount must be positive');
    }

    const entry = this.ledger.create({
      id: crypto.randomUUID(),
      walletId: wallet.id,
      bucket: input.bucket,
      direction: input.direction,
      type: input.type,
      amount: formatMoney(amountBigInt),
      currency: input.currency,
      idempotencyKey: input.idempotencyKey,
      description: input.description,
      metadata: input.metadata ?? {},
      paymentDistributionId: input.paymentDistributionId,
      createdAt: new Date(),
    });

    try {
      return await this.ledger.save(entry);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === '23505'
      ) {
        // Duplicate idempotency key - return existing entry
        const existing = await this.ledger.findOne({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async moveFunds(input: {
    userId: string;
    currency: string;
    fromBucket: LedgerBalanceBucket;
    toBucket: LedgerBalanceBucket;
    amount: string;
    type: LedgerEntryType;
    idempotencyKey: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ debit: WalletLedgerEntry; credit: WalletLedgerEntry }> {
    const wallet = await this.findOrCreateWallet(input.userId, input.currency);
    const balance = await this.calculateBalance(wallet.id);

    // Validate sufficient funds in source bucket
    const fromBucketBalance =
      input.fromBucket === LedgerBalanceBucket.AVAILABLE
        ? balance.available
        : input.fromBucket === LedgerBalanceBucket.PENDING
          ? balance.pending
          : balance.held;

    if (parseMoney(fromBucketBalance) < parseMoney(input.amount)) {
      throw new BadRequestException(
        `Insufficient ${input.fromBucket} balance`,
      );
    }

    // Create debit from source bucket
    const debit = await this.addLedgerEntry({
      userId: input.userId,
      currency: input.currency,
      bucket: input.fromBucket,
      direction: LedgerEntryDirection.DEBIT,
      type: input.type,
      amount: input.amount,
      idempotencyKey: `${input.idempotencyKey}-debit`,
      description: input.description,
      metadata: input.metadata,
    });

    // Create credit to destination bucket
    const credit = await this.addLedgerEntry({
      userId: input.userId,
      currency: input.currency,
      bucket: input.toBucket,
      direction: LedgerEntryDirection.CREDIT,
      type: input.type,
      amount: input.amount,
      idempotencyKey: `${input.idempotencyKey}-credit`,
      description: input.description,
      metadata: input.metadata,
    });

    return { debit, credit };
  }
}
