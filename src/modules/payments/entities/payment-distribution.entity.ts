import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { PaymentDistributionType } from '../../../shared';

@Entity('payment_distributions')
export class PaymentDistribution {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index()
  paymentId!: string;

  @Column('uuid', { nullable: true })
  @Index()
  participantShareId?: string | null;

  @Column('uuid', { nullable: true })
  @Index()
  recipientUserId?: string | null;

  @Column('uuid', { nullable: true })
  @Index()
  walletId?: string | null;

  @Column('varchar')
  type!: PaymentDistributionType;

  @Column('numeric', { precision: 19, scale: 4 })
  amount!: string;

  @Column('varchar', { length: 3 })
  currency!: string;

  @Column('varchar', { length: 160, unique: true })
  idempotencyKey!: string;

  @Column('timestamptz')
  createdAt!: Date;
}
