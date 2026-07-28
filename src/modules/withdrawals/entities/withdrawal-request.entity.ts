import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { WithdrawalStatus } from '../../../shared';

@Entity('withdrawal_requests')
export class WithdrawalRequest {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index()
  walletId!: string;

  @Column('uuid')
  @Index()
  userId!: string;

  @Column('numeric', { precision: 19, scale: 4 })
  amount!: string;

  @Column('varchar', { length: 3 })
  currency!: string;

  @Column('varchar')
  @Index()
  status!: WithdrawalStatus;

  @Column('varchar', { length: 80 })
  destinationType!: string;

  @Column('varchar', { length: 500 })
  destinationReference!: string;

  @Column('varchar', { length: 160, unique: true })
  idempotencyKey!: string;

  @Column('varchar', { length: 1000, nullable: true })
  failureReason?: string | null;

  @Column('timestamptz')
  requestedAt!: Date;

  @Column('timestamptz', { nullable: true })
  reviewedAt?: Date | null;

  @Column('timestamptz', { nullable: true })
  processedAt?: Date | null;

  @Column('timestamptz')
  createdAt!: Date;

  @Column('timestamptz')
  updatedAt!: Date;
}
