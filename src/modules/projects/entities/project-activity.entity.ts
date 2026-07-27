import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type ProjectActivityVisibility =
  'project' | 'team_only' | 'conversation';

@Entity('project_activities')
export class ProjectActivity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index()
  projectId!: string;

  @Column('uuid', { nullable: true })
  conversationId?: string | null;

  @Column('uuid', { nullable: true })
  actorId?: string | null;

  @Column({ length: 80 })
  type!: string;

  @Column('uuid', { nullable: true })
  entityId?: string | null;

  @Column({ type: 'varchar', default: 'project' })
  visibility!: ProjectActivityVisibility;

  @Column('jsonb', { default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @Column()
  createdAt!: string;
}
