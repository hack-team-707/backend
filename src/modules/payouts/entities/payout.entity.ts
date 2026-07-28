import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { PaymentProvider, PayoutStatus } from '../../../shared';

@Entity('payouts')
@Index('IDX_payouts_provider_reference', ['provider', 'providerPayoutId'], {
  unique: true,
  where: '"providerPayoutId" IS NOT NULL',
})
export class Payout {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index({ unique: true })
  withdrawalRequestId!: string;

  @Column('varchar')
  provider!: PaymentProvider;

  @Column('varchar', { length: 255, nullable: true })
  providerPayoutId?: string | null;

  @Column('varchar', { length: 160, unique: true })
  idempotencyKey!: string;

  @Column('numeric', { precision: 19, scale: 4 })
  amount!: string;

  @Column('numeric', { precision: 19, scale: 4, default: '0' })
  feeAmount!: string;

  @Column('numeric', { precision: 19, scale: 4 })
  netAmount!: string;

  @Column('varchar', { length: 3 })
  currency!: string;

  @Column('varchar')
  @Index()
  status!: PayoutStatus;

  @Column('varchar', { length: 120, nullable: true })
  failureCode?: string | null;

  @Column('varchar', { length: 1000, nullable: true })
  failureMessage?: string | null;

  @Column('timestamptz', { nullable: true })
  paidAt?: Date | null;

  @Column('timestamptz')
  createdAt!: Date;

  @Column('timestamptz')
  updatedAt!: Date;
}
