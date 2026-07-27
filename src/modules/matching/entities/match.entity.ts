import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { MatchStatus, TaxonomySkill, TeamRole } from '../../../shared';

export type MatchInvitationKind = 'individual' | 'team';

@Entity('matches')
export class Match {
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
  solverId!: string;

  @Column('text', { array: true })
  skillCardIds!: string[];

  @Column('jsonb')
  requiredSkills!: TaxonomySkill[];

  @Column('text', { array: true })
  matchedSkillIds!: string[];

  @Column('double precision')
  score!: number;

  @Column('double precision')
  coverage!: number;

  @Column('text', { array: true })
  explanation!: string[];

  @Column()
  status!: MatchStatus;

  @Column({ nullable: true })
  requestedAt?: string;

  @Column({ nullable: true })
  invitationKind?: MatchInvitationKind;

  @Column('uuid', { nullable: true })
  teamId?: string;

  @Column({ nullable: true })
  teamRole?: TeamRole;

  @Column()
  createdAt!: string;

  @Column()
  updatedAt!: string;
}
