import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index()
  sessionId!: string;

  @Column('uuid')
  @Index()
  familyId!: string;

  @Column('uuid', { nullable: true })
  parentTokenId?: string | null;

  @Column({ type: 'varchar', length: 64, unique: true })
  tokenHash!: string;

  @Column({ type: 'varchar' })
  createdAt!: string;

  @Column({ type: 'varchar' })
  @Index()
  expiresAt!: string;

  @Column({ type: 'varchar', nullable: true })
  consumedAt?: string | null;

  @Column({ type: 'varchar', nullable: true })
  revokedAt?: string | null;

  @Column('uuid', { nullable: true })
  replacedByTokenId?: string | null;
}
