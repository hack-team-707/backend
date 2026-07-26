import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { ProjectMessageType } from '../../../shared';

@Entity('project_messages')
export class ProjectMessage {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  @Index()
  projectId!: string;

  @Column()
  senderId!: string;

  @Column()
  type!: ProjectMessageType;

  @Column({ nullable: true })
  text?: string;

  @Column('text', { array: true })
  attachmentUrls!: string[];

  @Column()
  createdAt!: string;
}
