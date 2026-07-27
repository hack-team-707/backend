import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { ProjectMessageType } from '../../../shared';

@Entity('project_messages')
@Index(['conversationId', 'idempotencyKey'], {
  unique: true,
  where: '"idempotencyKey" IS NOT NULL',
})
export class ProjectMessage {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  @Index()
  projectId!: string;

  @Column('uuid', { nullable: true })
  @Index()
  conversationId?: string | null;

  @Column()
  senderId!: string;

  @Column()
  type!: ProjectMessageType;

  @Column({ type: 'varchar', nullable: true })
  text?: string;

  @Column('uuid', { nullable: true })
  parentMessageId?: string | null;

  @Column('text', { array: true, default: () => "'{}'::text[]" })
  attachmentUrls!: string[];

  @Column('text', { array: true, default: () => "'{}'::text[]" })
  mentionUserIds!: string[];

  @Column('jsonb', { default: () => "'{}'::jsonb" })
  reactions!: Record<string, string[]>;

  @Column({ type: 'varchar', nullable: true })
  idempotencyKey?: string | null;

  @Column({ type: 'varchar', nullable: true })
  editedAt?: string | null;

  @Column({ type: 'varchar', nullable: true })
  deletedAt?: string | null;

  @Column()
  createdAt!: string;

  @Column()
  updatedAt!: string;
}
