import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import {
  ExternalChannelRecommendation,
  NoMatchAiGuide,
} from '../no-match-resolution.types';

@Entity('no_match_resolutions')
export class NoMatchResolution {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ unique: true })
  @Index()
  problemId!: string;

  @Column()
  @Index()
  ownerId!: string;

  @Column('float')
  minimumCoverage!: number;

  @Column('float')
  bestCoverage!: number;

  @Column('text', { array: true })
  requiredSkills!: string[];

  @Column('text')
  message!: string;

  @Column('jsonb')
  recommendations!: ExternalChannelRecommendation[];

  @Column('jsonb', { nullable: true })
  aiGuide?: NoMatchAiGuide | null;

  @Column()
  createdAt!: string;

  @Column()
  updatedAt!: string;
}
