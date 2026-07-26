import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export enum ConversationType {
  PROBLEM = 'problem',
  CAPABILITY = 'capability',
  INQUIRY = 'inquiry',
}

export enum ConversationStatus {
  ACTIVE = 'active',
  PENDING_CONFIRMATION = 'pending_confirmation',
  CONFIRMING = 'confirming',
  CONFIRMED = 'confirmed',
}

export enum ConversationActionType {
  PUBLISH_PROBLEM = 'publish_problem',
  REGISTER_CAPABILITY = 'register_capability',
}

export interface StructuredCard {
  actionType: ConversationActionType;
  payload: Record<string, unknown>;
  analysis?: {
    category?: string;
    urgencyLevel?: string;
    requiredSkills?: string[];
    summary?: string;
  };
}

@Entity('conversations')
export class Conversation {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  @Index()
  ownerId!: string;

  @Column()
  type!: ConversationType;

  @Column()
  status!: ConversationStatus;

  @Column('jsonb', { nullable: true })
  pendingCard?: StructuredCard | null;

  @Column({ nullable: true })
  linkedEntityId?: string;

  @Column()
  createdAt!: string;

  @Column()
  updatedAt!: string;
}
