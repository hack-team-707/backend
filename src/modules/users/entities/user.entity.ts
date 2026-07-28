import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { UserRole } from '../../../shared';

@Entity('users')
export class User {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  @Index({ unique: true })
  email!: string;

  @Column()
  displayName!: string;

  @Column()
  passwordHash!: string;

  @Column({ type: 'varchar', default: 'scrypt' })
  passwordAlgorithm!: 'scrypt' | 'bcrypt';

  @Column({ default: false })
  mfaEnabled!: boolean;

  @Column({ type: 'varchar', nullable: true })
  mfaSecretEncrypted?: string | null;

  @Column({ type: 'varchar', nullable: true })
  mfaPendingSecretEncrypted?: string | null;

  @Column({ type: 'varchar', nullable: true })
  mfaVerifiedAt?: string | null;

  @Column({ type: 'bigint', nullable: true })
  mfaLastUsedTimeStep?: string | null;

  @Column('text', { array: true })
  roles!: UserRole[];

  @Column()
  createdAt!: string;

  @Column()
  updatedAt!: string;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  roles: UserRole[];
  createdAt: string;
  updatedAt: string;
}

export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  roles: user.roles,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});
