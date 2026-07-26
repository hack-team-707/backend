import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { GeoCoordinates, ProblemStatus } from '../../../shared';

@Entity('problems')
export class Problem {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  @Index()
  ownerId!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  audioUrl?: string;

  @Column('text', { array: true })
  imageUrls!: string[];

  @Column('text', { array: true })
  attachmentUrls!: string[];

  @Column({ nullable: true, select: false })
  encryptedGeolocation?: string;

  @Column()
  hasGeolocation!: boolean;

  @Column()
  status!: ProblemStatus;

  @Column()
  createdAt!: string;

  @Column()
  updatedAt!: string;
}

export interface ProblemInput {
  description?: string;
  audioUrl?: string;
  imageUrls?: string[];
  attachmentUrls?: string[];
  geolocation?: GeoCoordinates;
}
