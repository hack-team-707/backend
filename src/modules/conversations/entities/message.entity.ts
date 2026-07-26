import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { CapabilityAssessmentState } from '../../ai-engine/ai-provider';
import { NoMatchResolutionView } from '../../matching/no-match-resolution.types';
import { FederatedOpportunity } from '../../matching/opportunity-search.types';
import { StructuredCard } from './conversation.entity';

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export interface MessageAnalysisMetadata {
  intent: 'submit_problem' | 'register_skill' | 'general_question' | 'unclear';
  confidence: number;
  missingFields: string[];
  provider: string;
  capabilityAssessment?: CapabilityAssessmentState;
  quickReplies?: string[];
  countdownSeconds?: number;
  opportunities?: FederatedOpportunity[];
  opportunitySearch?: {
    query: string;
    strategy: 'internal_first' | 'external_fallback';
    sourcesConsulted: Array<'resolve' | 'himalayas' | 'freelancer'>;
  };
  noMatchResolution?: NoMatchResolutionView;
}

@Entity('messages')
@Index(['conversationId', 'idempotencyKey'], { unique: true })
export class Message {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  @Index()
  conversationId!: string;

  @Column()
  senderId!: string;

  @Column({ type: 'enum', enum: MessageRole, default: MessageRole.USER })
  role!: MessageRole;

  @Column({ nullable: true })
  @Index()
  replyToMessageId?: string;

  @Column({ nullable: true })
  text?: string;

  @Column('text', { array: true })
  mediaUrls!: string[];

  @Column('jsonb', { nullable: true })
  structuredCard?: StructuredCard;

  @Column('jsonb', { nullable: true })
  analysisMetadata?: MessageAnalysisMetadata;

  @Column({ nullable: true })
  idempotencyKey?: string;

  @Column({ nullable: true, select: false })
  encryptedCoordinates?: string;

  @Column({ nullable: true })
  approximateArea?: string;

  @Column()
  locationShared!: boolean;

  @Column()
  createdAt!: string;
}
