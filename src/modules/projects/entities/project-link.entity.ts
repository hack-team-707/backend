import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { ProjectFileVisibility, ProjectLinkType } from '../../../shared';

@Entity('project_links')
export class ProjectLink {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index()
  projectId!: string;

  @Column('uuid', { nullable: true })
  conversationId?: string | null;

  @Column('uuid')
  createdBy!: string;

  @Column({ type: 'varchar' })
  type!: ProjectLinkType;

  @Column({ length: 2048 })
  url!: string;

  @Column({ length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  repositoryName?: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  defaultBranch?: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  modulePath?: string | null;

  @Column({ type: 'varchar' })
  visibility!: ProjectFileVisibility;

  @Column()
  createdAt!: string;

  @Column()
  updatedAt!: string;
}
