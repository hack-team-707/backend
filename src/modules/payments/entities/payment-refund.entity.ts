import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';
import { PaymentRefundStatus } from '../../../shared';

@Entity('payment_refunds')
@Unique('UQ_payment_refunds_idempotency', ['idempotencyKey'])
export class PaymentRefund {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index()
  paymentId!: string;

  @Column('numeric', { precision: 19, scale: 4 })
  amount!: string;

  @Column('varchar', { length: 3 })
  currency!: string;

  @Column('varchar', { length: 255, nullable: true })
  providerRefundId?: string | null;

  @Column('varchar')
  @Index()
  status!: PaymentRefundStatus;

  @Column('varchar', { length: 500 })
  reason!: string;

  @Column('uuid')
  requestedBy!: string;

  @Column('varchar', { length: 160 })
  idempotencyKey!: string;

  @Column('timestamptz')
  createdAt!: Date;

  @Column('timestamptz')
  updatedAt!: Date;
}
