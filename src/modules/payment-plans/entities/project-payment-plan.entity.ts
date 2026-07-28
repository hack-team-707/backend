import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';
import { PaymentPlanStatus } from '../../../shared';

@Entity('project_payment_plans')
@Unique('UQ_project_payment_plans_project_version', ['projectId', 'version'])
export class ProjectPaymentPlan {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index()
  projectId!: string;

  @Column('integer')
  version!: number;

  @Column('uuid')
  @Index()
  createdBy!: string;

  @Column('uuid')
  @Index()
  feeConfigId!: string;

  @Column('varchar')
  @Index()
  status!: PaymentPlanStatus;

  @Column('varchar', { length: 3 })
  currency!: string;

  @Column('numeric', { precision: 19, scale: 4 })
  totalAmount!: string;

  @Column('numeric', { precision: 19, scale: 4, default: '0' })
  fundedAmount!: string;

  @Column('numeric', { precision: 19, scale: 4, default: '0' })
  releasedAmount!: string;

  @Column('timestamptz', { nullable: true })
  activatedAt?: Date | null;

  @Column('timestamptz', { nullable: true })
  completedAt?: Date | null;

  @Column('timestamptz')
  createdAt!: Date;

  @Column('timestamptz')
  updatedAt!: Date;
}
