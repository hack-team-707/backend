import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ExternalResultType } from '../enums/external-result-type.enum';
import { TalentProviderName } from '../enums/talent-provider.enum';
import { ExternalTalentSearch } from './external-talent-search.entity';

@Entity('external_talent_results')
@Index(['provider', 'externalId'])
export class ExternalTalentResult {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index()
  searchId!: string;

  @ManyToOne(() => ExternalTalentSearch, (search) => search.results, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'searchId' })
  search?: ExternalTalentSearch;

  @Column('enum', { enum: TalentProviderName })
  provider!: TalentProviderName;

  @Column('varchar', { length: 255 })
  externalId!: string;

  @Column('enum', { enum: ExternalResultType })
  resultType!: ExternalResultType;

  @Column('varchar', { length: 500 })
  name!: string;

  @Column('varchar', { length: 500, nullable: true })
  headline?: string;

  @Column('text', { nullable: true })
  description?: string;

  @Column('text', { array: true, default: '{}' })
  skills!: string[];

  @Column('double precision', { nullable: true })
  rating?: number;

  @Column('int', { nullable: true })
  reviewCount?: number;

  @Column('double precision', { nullable: true })
  hourlyRate?: number;

  @Column('varchar', { length: 12, nullable: true })
  currency?: string;

  @Column('jsonb', { nullable: true })
  location?: Record<string, unknown>;

  @Column('text', { nullable: true })
  profileUrl?: string;

  @Column('text', { nullable: true })
  contactUrl?: string;

  @Column('text', { nullable: true })
  websiteUrl?: string;

  @Column('varchar', { length: 80, nullable: true })
  phone?: string;

  @Column('varchar', { length: 20, default: 'UNKNOWN' })
  availability!: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';

  @Column('double precision')
  compatibilityScore!: number;

  @Column('text', { array: true, default: '{}' })
  compatibilityReasons!: string[];

  @Column('text', { array: true, default: '{}' })
  missingSkills!: string[];

  @Column('jsonb', { nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  createdAt!: Date;

  @Column('timestamptz')
  @Index()
  expiresAt!: Date;
}
