import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import {
  LedgerBalanceBucket,
  LedgerEntryDirection,
  LedgerEntryType,
} from '../../../shared';

@Entity('wallet_ledger_entries')
@Index('IDX_wallet_ledger_entries_wallet_created', ['walletId', 'createdAt'])
export class WalletLedgerEntry {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  walletId!: string;

  @Column('uuid', { nullable: true })
  @Index()
  paymentDistributionId?: string | null;

  @Column('varchar')
  bucket!: LedgerBalanceBucket;

  @Column('varchar')
  direction!: LedgerEntryDirection;

  @Column('varchar')
  type!: LedgerEntryType;

  @Column('numeric', { precision: 19, scale: 4 })
  amount!: string;

  @Column('varchar', { length: 3 })
  currency!: string;

  @Column('varchar', { length: 160, unique: true })
  idempotencyKey!: string;

  @Column('varchar', { length: 500, nullable: true })
  description?: string | null;

  @Column('jsonb', { default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @Column('timestamptz')
  createdAt!: Date;
}
