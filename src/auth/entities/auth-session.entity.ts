import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('auth_sessions')
export class AuthSession {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  @Index()
  userId!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddressHash?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent?: string | null;

  @Column({ type: 'varchar' })
  createdAt!: string;

  @Column({ type: 'varchar' })
  lastUsedAt!: string;

  @Column({ type: 'varchar' })
  @Index()
  expiresAt!: string;

  @Column({ type: 'varchar', nullable: true })
  revokedAt?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  revocationReason?: string | null;

  @Column({ type: 'varchar', nullable: true })
  mfaVerifiedAt?: string | null;
}
