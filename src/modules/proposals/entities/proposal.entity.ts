import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { ProposalStatus } from '../../../shared';

export interface ProposalActivity {
  title: string;
  description: string;
}

export interface ProposalTeamMember {
  solverId: string;
  responsibilities: string[];
}

export interface ProposalScheduledDeliverable {
  id: string;
  title: string;
  description: string;
  dueDate: string;
}

@Entity('proposals')
export class Proposal {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  @Index()
  problemId!: string;

  @Column()
  @Index()
  requesterId!: string;

  @Column()
  @Index()
  submittedBy!: string;

  @Column({ nullable: true })
  teamId?: string;

  @Column('text', { array: true })
  solverIds!: string[];

  @Column()
  summary!: string;

  @Column()
  scope!: string;

  @Column('jsonb')
  activities!: ProposalActivity[];

  @Column('jsonb')
  teamMembers!: ProposalTeamMember[];

  @Column('text', { array: true })
  deliverables!: string[];

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  deliverySchedule!: ProposalScheduledDeliverable[];

  @Column()
  estimatedDuration!: string;

  @Column('double precision')
  price!: number;

  @Column()
  currency!: string;

  @Column('text', { array: true })
  conditions!: string[];

  @Column('text', { array: true })
  acceptanceCriteria!: string[];

  @Column()
  status!: ProposalStatus;

  @Column()
  revision!: number;

  @Column({ nullable: true })
  responseNote?: string;

  @Column()
  createdAt!: string;

  @Column()
  updatedAt!: string;
}
