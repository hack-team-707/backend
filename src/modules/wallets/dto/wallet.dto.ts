import { ApiProperty } from '@nestjs/swagger';
import {
  LedgerBalanceBucket,
  LedgerEntryDirection,
  LedgerEntryType,
} from '../../../shared';

export class WalletBalanceDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ description: 'Total balance in all buckets' })
  total!: string;

  @ApiProperty({ description: 'Available balance for withdrawal' })
  available!: string;

  @ApiProperty({ description: 'Pending balance (not yet confirmed)' })
  pending!: string;

  @ApiProperty({ description: 'Held balance (frozen for disputes)' })
  held!: string;
}

export class LedgerEntryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  bucket!: LedgerBalanceBucket;

  @ApiProperty()
  direction!: LedgerEntryDirection;

  @ApiProperty()
  type!: LedgerEntryType;

  @ApiProperty()
  amount!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ required: false })
  description?: string | null;

  @ApiProperty()
  metadata!: Record<string, unknown>;

  @ApiProperty()
  createdAt!: Date;
}

export class WalletDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  balance!: WalletBalanceDto;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
