import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { EvidenceStatus, EvidenceType } from '../../../shared';

@Entity('evidence')
export class Evidence {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  @Index()
  projectId!: string;

  @Column()
  @Index()
  submittedBy!: string;

  @Column()
  type!: EvidenceType;

  @Column()
  title!: string;

  @Column()
  description!: string;

  @Column({ nullable: true })
  referenceUrl?: string;

  @Column({ nullable: true })
  fileName?: string;

  @Column({ nullable: true })
  mimeType?: string;

  @Column({ nullable: true })
  sizeBytes?: number;

  @Column()
  status!: EvidenceStatus;

  @Column({ nullable: true })
  reviewNote?: string;

  @Column({ nullable: true })
  reviewedBy?: string;

  @Column({ nullable: true })
  reviewedAt?: string;

  @Column()
  createdAt!: string;

  @Column()
  updatedAt!: string;
}
