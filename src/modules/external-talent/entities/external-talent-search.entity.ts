import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProblemModality } from '../enums/problem-modality.enum';
import { TalentProviderName } from '../enums/talent-provider.enum';
import { ExternalTalentResult } from './external-talent-result.entity';

@Entity('external_talent_searches')
export class ExternalTalentSearch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index()
  problemId!: string;

  @Column('uuid')
  @Index()
  requestedBy!: string;

  @Column('enum', { enum: ProblemModality })
  modality!: ProblemModality;

  @Column('varchar', { length: 500 })
  query!: string;

  @Column('text', { array: true, default: '{}' })
  requiredSkills!: string[];

  @Column('jsonb', { default: '[]' })
  providersExecuted!: TalentProviderName[];

  @Column('varchar', { length: 30, default: 'completed' })
  status!: string;

  @Column('int', { default: 0 })
  totalResults!: number;

  @OneToMany(() => ExternalTalentResult, (result) => result.search)
  results?: ExternalTalentResult[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
