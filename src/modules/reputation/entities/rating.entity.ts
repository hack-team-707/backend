import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('ratings')
@Index(['projectId', 'raterId', 'rateeId'], { unique: true })
export class Rating {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  @Index()
  projectId!: string;

  @Column()
  @Index()
  raterId!: string;

  @Column()
  @Index()
  rateeId!: string;

  @Column()
  score!: number;

  @Column({ nullable: true })
  comment?: string;

  @Column()
  createdAt!: string;
}
