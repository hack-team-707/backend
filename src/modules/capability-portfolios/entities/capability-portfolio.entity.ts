import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import {
  CapabilityAssessmentAnswer,
  CapabilityAssessmentQuestion,
  CapabilityAssessmentResult,
} from '../../ai-engine/ai-provider';

@Entity('capability_portfolios')
export class CapabilityPortfolio {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  @Index()
  ownerId!: string;

  @Column({ unique: true })
  @Index()
  conversationId!: string;

  @Column({ unique: true })
  @Index()
  slug!: string;

  @Column()
  capability!: string;

  @Column('text', { array: true })
  tags!: string[];

  @Column('jsonb')
  assessment!: CapabilityAssessmentResult;

  @Column('jsonb')
  questions!: CapabilityAssessmentQuestion[];

  @Column('jsonb')
  answers!: CapabilityAssessmentAnswer[];

  @Column()
  createdAt!: string;
}
