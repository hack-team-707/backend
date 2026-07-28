import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';
import { ParticipantShareAcceptanceStatus } from '../../../shared';

@Entity('project_participant_shares')
@Unique('UQ_project_participant_shares_plan_user', ['paymentPlanId', 'userId'])
export class ProjectParticipantShare {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index()
  paymentPlanId!: string;

  @Column('uuid')
  @Index()
  userId!: string;

  @Column('integer')
  shareBasisPoints!: number;

  @Column('numeric', { precision: 19, scale: 4 })
  amount!: string;

  @Column('varchar', { default: ParticipantShareAcceptanceStatus.PENDING })
  @Index()
  acceptanceStatus!: ParticipantShareAcceptanceStatus;

  @Column('timestamptz', { nullable: true })
  respondedAt?: Date | null;

  @Column('timestamptz')
  createdAt!: Date;

  @Column('timestamptz')
  updatedAt!: Date;
}
