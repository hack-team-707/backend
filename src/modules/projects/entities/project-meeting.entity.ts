import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import {
  ProjectFileVisibility,
  ProjectMeetingStatus,
  ProjectMeetingType,
} from '../../../shared';

@Entity('project_meetings')
export class ProjectMeeting {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index()
  projectId!: string;

  @Column('uuid', { nullable: true })
  conversationId?: string | null;

  @Column('uuid')
  createdBy!: string;

  @Column({ length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  description?: string | null;

  @Column({ type: 'varchar' })
  type!: ProjectMeetingType;

  @Column({ type: 'varchar' })
  status!: ProjectMeetingStatus;

  @Column()
  startAt!: string;

  @Column()
  endAt!: string;

  @Column({ length: 80 })
  timezone!: string;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  meetingUrl?: string | null;

  @Column({ default: 30 })
  reminderMinutes!: number;

  @Column({ type: 'varchar', length: 5000, nullable: true })
  notes?: string | null;

  @Column('text', { array: true })
  participantIds!: string[];

  @Column({ type: 'varchar' })
  visibility!: ProjectFileVisibility;

  @Column()
  createdAt!: string;

  @Column()
  updatedAt!: string;
}
