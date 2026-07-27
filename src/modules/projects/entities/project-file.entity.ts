import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { ProjectFileCategory, ProjectFileVisibility } from '../../../shared';

@Entity('project_files')
export class ProjectFile {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index()
  projectId!: string;

  @Column('uuid', { nullable: true })
  @Index()
  conversationId?: string | null;

  @Column('uuid', { nullable: true })
  messageId?: string | null;

  @Column('uuid')
  uploadedBy!: string;

  @Column({ length: 255 })
  originalName!: string;

  @Column({ length: 255 })
  storedName!: string;

  @Column({ length: 160 })
  mimeType!: string;

  @Column({ length: 16 })
  extension!: string;

  @Column('bigint')
  size!: string;

  @Column({ length: 500, unique: true })
  storageKey!: string;

  @Column({ type: 'varchar' })
  category!: ProjectFileCategory;

  @Column({ type: 'varchar' })
  visibility!: ProjectFileVisibility;

  @Column({ type: 'varchar', nullable: true })
  deletedAt?: string | null;

  @Column()
  createdAt!: string;

  @Column()
  updatedAt!: string;
}
