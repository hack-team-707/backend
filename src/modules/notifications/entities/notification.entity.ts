import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export enum NotificationType {
  MATCH_FOUND = 'match_found',
  PROPOSAL_RECEIVED = 'proposal_received',
  PROPOSAL_RESPONDED = 'proposal_responded',
  PROJECT_STARTED = 'project_started',
  PROJECT_COMPLETED = 'project_completed',
  PROJECT_MESSAGE = 'project_message',
  EVIDENCE_SUBMITTED = 'evidence_submitted',
  VALIDATION_REQUESTED = 'validation_requested',
  RATING_RECEIVED = 'rating_received',
  SYSTEM_ANNOUNCEMENT = 'system_announcement',
  DISPUTE_OPENED = 'dispute_opened',
  DISPUTE_UPDATED = 'dispute_updated',
}

@Entity('notifications')
export class Notification {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  @Index()
  userId!: string;

  @Column()
  type!: NotificationType;

  @Column()
  title!: string;

  @Column()
  message!: string;

  @Column({ nullable: true })
  href?: string;

  @Column()
  read!: boolean;

  @Column()
  createdAt!: string;
}

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  href?: string;
}
