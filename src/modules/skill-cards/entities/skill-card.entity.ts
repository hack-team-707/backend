import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { ProficiencyLevel, SkillCardStatus } from '../../../shared';
import { CapabilityAssessmentResult } from '../../ai-engine/ai-provider';

@Entity('skill_cards')
export class SkillCard {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  @Index()
  ownerId!: string;

  @Column()
  proficiencyLevel!: ProficiencyLevel;

  @Column('text', { array: true })
  tags!: string[];

  @Column('text', { array: true })
  evidenceLinks!: string[];

  @Column('jsonb', { nullable: true })
  assessment?: CapabilityAssessmentResult;

  @Column()
  status!: SkillCardStatus;

  @Column()
  createdAt!: string;

  @Column()
  updatedAt!: string;
}

export interface SkillCardInput {
  proficiencyLevel: ProficiencyLevel;
  tags: string[];
  evidenceLinks: string[];
  assessment?: CapabilityAssessmentResult;
}
