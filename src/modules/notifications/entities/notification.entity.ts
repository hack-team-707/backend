import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export enum NotificationType {
  MATCH_FOUND = 'match_found',
  OPPORTUNITY_AVAILABLE = 'opportunity_available',
  MATCH_RESPONSE = 'match_response',
  TEAM_INVITATION = 'team_invitation',
  NO_INTERNAL_MATCH = 'no_internal_match',
  PROPOSAL_RECEIVED = 'proposal_received',
  PROPOSAL_RESPONDED = 'proposal_responded',
  PROJECT_STARTED = 'project_started',
  PROJECT_COMPLETED = 'project_completed',
  PROJECT_MESSAGE = 'project_message',
  EVIDENCE_SUBMITTED = 'evidence_submitted',
  VALIDATION_REQUESTED = 'validation_requested',
  RATING_RECEIVED = 'rating_received',
  SYSTEM_ANNOUNCEMENT = 'system_announcement',
  PAYMENT_PLAN_ACCEPTANCE_REQUIRED = 'payment_plan_acceptance_required',
  PAYMENT_PLAN_SHARE_ACCEPTED = 'payment_plan_share_accepted',
  PAYMENT_PLAN_ACTIVATED = 'payment_plan_activated',
  PAYMENT_PLAN_REJECTED = 'payment_plan_rejected',
  PAYMENT_APPROVED = 'payment_approved',
  PAYMENT_FAILED = 'payment_failed',
  PAYMENT_REFUNDED = 'payment_refunded',
  FUNDS_RELEASED = 'funds_released',
  WITHDRAWAL_REQUESTED = 'withdrawal_requested',
  WITHDRAWAL_APPROVED = 'withdrawal_approved',
  WITHDRAWAL_REJECTED = 'withdrawal_rejected',
  WITHDRAWAL_COMPLETED = 'withdrawal_completed',
  PAYOUT_COMPLETED = 'payout_completed',
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
