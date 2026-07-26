import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type ProjectInvitationStatus =
  'pending' | 'accepted' | 'rejected' | 'cancelled';

@Entity('project_invitations')
@Index(['projectId', 'invitedUserId', 'status'])
export class ProjectInvitation {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index()
  projectId!: string;

  @Column('uuid')
  @Index()
  invitedUserId!: string;

  @Column('uuid')
  invitedBy!: string;

  @Column('text', { array: true, default: () => "'{}'" })
  desiredSkills!: string[];

  @Column('double precision', { default: 20 })
  allocationPercent!: number;

  @Column()
  status!: ProjectInvitationStatus;

  @Column()
  createdAt!: string;

  @Column()
  updatedAt!: string;

  @Column({ nullable: true })
  respondedAt?: string;
}
