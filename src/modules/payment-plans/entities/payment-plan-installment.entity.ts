import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';
import { PaymentInstallmentStatus } from '../../../shared';

@Entity('payment_plan_installments')
@Unique('UQ_payment_plan_installments_plan_sequence', [
  'paymentPlanId',
  'sequence',
])
export class PaymentPlanInstallment {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index()
  paymentPlanId!: string;

  @Column('integer')
  sequence!: number;

  @Column('integer')
  allocationBasisPoints!: number;

  @Column('varchar', { length: 240 })
  description!: string;

  @Column('numeric', { precision: 19, scale: 4 })
  amount!: string;

  @Column('varchar')
  @Index()
  status!: PaymentInstallmentStatus;

  @Column('timestamptz')
  @Index()
  dueAt!: Date;

  @Column('timestamptz', { nullable: true })
  paidAt?: Date | null;

  @Column('timestamptz')
  createdAt!: Date;

  @Column('timestamptz')
  updatedAt!: Date;
}
