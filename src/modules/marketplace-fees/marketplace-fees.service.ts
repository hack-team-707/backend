import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import {
  DataSource,
  IsNull,
  LessThanOrEqual,
  MoreThan,
  Repository,
} from 'typeorm';
import { formatMoney, parseMoney } from '../../common/money';
import { CreateMarketplaceFeeDto } from './dto/marketplace-fee.dto';
import { MarketplaceFeeConfig } from './entities/marketplace-fee-config.entity';

@Injectable()
export class MarketplaceFeesService {
  constructor(
    @InjectRepository(MarketplaceFeeConfig)
    private readonly fees: Repository<MarketplaceFeeConfig>,
    private readonly dataSource: DataSource,
  ) {}

  async createVersion(
    actorId: string,
    dto: CreateMarketplaceFeeDto,
  ): Promise<MarketplaceFeeConfig> {
    const name = dto.name.trim();
    if (!name)
      throw new ConflictException('Fee configuration name is required');
    const currency = dto.currency.toUpperCase();
    const effectiveFrom = new Date(dto.effectiveFrom);
    const fixedFeeAmount = formatMoney(parseMoney(dto.fixedFeeAmount));

    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `marketplace-fee:${name}`,
      ]);
      const repository = manager.getRepository(MarketplaceFeeConfig);
      const versions = await repository.find({
        where: { name },
        order: { version: 'DESC' },
        lock: { mode: 'pessimistic_write' },
      });
      const sameCurrency = versions.filter(
        (config) => config.currency === currency,
      );
      const duplicateEffectiveDate = sameCurrency.some(
        (config) => config.effectiveFrom.getTime() === effectiveFrom.getTime(),
      );
      if (duplicateEffectiveDate)
        throw new ConflictException(
          'A fee configuration already starts at this effective date',
        );
      const nextConfig = sameCurrency
        .filter((config) => config.effectiveFrom > effectiveFrom)
        .sort(
          (left, right) =>
            left.effectiveFrom.getTime() - right.effectiveFrom.getTime(),
        )[0];
      const overlapping = sameCurrency.filter(
        (config) =>
          config.effectiveFrom < effectiveFrom &&
          (!config.effectiveTo || config.effectiveTo > effectiveFrom),
      );
      for (const config of overlapping) {
        config.effectiveTo = effectiveFrom;
        config.isActive = false;
        config.updatedAt = new Date();
      }
      if (overlapping.length) await repository.save(overlapping);
      const now = new Date();
      return repository.save(
        repository.create({
          id: randomUUID(),
          name,
          version: (versions[0]?.version ?? 0) + 1,
          createdBy: actorId,
          feeBasisPoints: dto.feeBasisPoints,
          fixedFeeAmount,
          currency,
          isActive: !nextConfig,
          effectiveFrom,
          effectiveTo: nextConfig?.effectiveFrom ?? null,
          createdAt: now,
          updatedAt: now,
        }),
      );
    });
  }

  async current(
    currency: string,
    at = new Date(),
  ): Promise<MarketplaceFeeConfig> {
    const normalizedCurrency = currency?.toUpperCase();
    if (!normalizedCurrency || !/^[A-Z]{3}$/.test(normalizedCurrency))
      throw new BadRequestException('Currency must be a 3-letter ISO code');
    if (Number.isNaN(at.getTime()))
      throw new BadRequestException('Invalid effective date');
    const matches = await this.fees.find({
      where: [
        {
          currency: normalizedCurrency,
          effectiveFrom: LessThanOrEqual(at),
          effectiveTo: MoreThan(at),
        },
        {
          currency: normalizedCurrency,
          effectiveFrom: LessThanOrEqual(at),
          effectiveTo: IsNull(),
        },
      ],
      order: { version: 'DESC' },
    });
    if (!matches.length)
      throw new NotFoundException('No current fee configuration');
    if (matches.length !== 1)
      throw new ConflictException(
        'Expected exactly one current fee configuration',
      );
    return matches[0];
  }
}
