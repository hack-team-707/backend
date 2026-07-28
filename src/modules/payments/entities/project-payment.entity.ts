import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';
import { PaymentProvider, PaymentStatus } from '../../../shared';

@Entity('project_payments')
@Unique('UQ_project_payments_idempotency', ['idempotencyKey'])
export class ProjectPayment {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index()
  paymentPlanId!: string;

  @Column('uuid', { nullable: true })
  @Index()
  installmentId?: string | null;

  @Column('uuid')
  @Index()
  payerId!: string;

  @Column('varchar')
  provider!: PaymentProvider;

  @Column('varchar', { length: 255, nullable: true })
  providerPaymentId?: string | null;

  @Column('varchar', { length: 255, nullable: true })
  providerPreferenceId?: string | null;

  @Column('varchar', { length: 1000, nullable: true })
  checkoutUrl?: string | null;

  @Column('varchar', { length: 120, nullable: true })
  providerStatus?: string | null;

  @Column('varchar', { length: 255, nullable: true })
  externalReference?: string | null;

  @Column('varchar', { length: 160 })
  idempotencyKey!: string;

  @Column('numeric', { precision: 19, scale: 4 })
  amount!: string;

  @Column('varchar', { length: 3 })
  currency!: string;

  @Column('varchar')
  @Index()
  status!: PaymentStatus;

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
