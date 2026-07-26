import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { JobStatus } from '../../../shared';
import type { ProposalScheduledDeliverable } from '../../proposals/entities/proposal.entity';

@Entity('projects')
export class Project {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  @Index({ unique: true })
  proposalId!: string;

  @Column()
  @Index({ unique: true })
  problemId!: string;

  @Column()
  @Index()
  requesterId!: string;

  @Column('text', { array: true })
  solverIds!: string[];

  @Column('uuid', { nullable: true })
  leadSolverId?: string | null;

  @Column('text', { array: true })
  participantIds!: string[];

  @Column()
  title!: string;

  @Column('text', { array: true })
  acceptanceCriteria!: string[];

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  deliverySchedule!: ProposalScheduledDeliverable[];

  @Column('double precision', { nullable: true })
  totalPrice?: number | null;

  @Column('varchar', { nullable: true })
  currency?: string | null;

  @Column('jsonb', { default: () => "'{}'::jsonb" })
  memberShares!: Record<string, number>;

  @Column()
  status!: JobStatus;

  @Column({ nullable: true })
  completionNote?: string;

  @Column('text', { array: true })
  completionEvidenceIds!: string[];

  @Column({ nullable: true })
  validationNote?: string;

  @Column()
  createdAt!: string;

  @Column()
  updatedAt!: string;

  @Column({ nullable: true })
  closedAt?: string;
}
