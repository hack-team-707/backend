import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { TeamRole, TeamStatus } from '../../../shared';

export interface TeamMember {
  solverId: string;
  matchId: string;
  role: TeamRole;
  responsibilitySkillIds: string[];
  score: number;
}

@Entity('teams')
export class Team {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  @Index()
  problemId!: string;

  @Column()
  @Index()
  requesterId!: string;

  @Column('jsonb')
  members!: TeamMember[];

  @Column('text', { array: true })
  coveredSkillIds!: string[];

  @Column('text', { array: true, default: () => "'{}'" })
  missingSkillIds!: string[];

  @Column('double precision')
  coverage!: number;

  @Column('text', { array: true })
  rationale!: string[];

  @Column()
  status!: TeamStatus;

  @Column()
  createdAt!: string;

  @Column()
  updatedAt!: string;
}
