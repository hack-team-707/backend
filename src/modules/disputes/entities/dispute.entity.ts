import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { DisputeStatus } from '../../../shared';

@Entity('disputes')
export class Dispute {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  @Index()
  projectId!: string;

  @Column()
  @Index()
  openedBy!: string;

  @Column('text', { array: true })
  participantIds!: string[];

  @Column()
  reason!: string;

  @Column()
  status!: DisputeStatus;

  @Column({ nullable: true })
  reviewNote?: string;

  @Column({ nullable: true })
  reviewedBy?: string;

  @Column({ nullable: true })
  reviewedAt?: string;

  @Column({ nullable: true })
  resolvedAt?: string;

  @Column()
  createdAt!: string;

  @Column()
  updatedAt!: string;
}
