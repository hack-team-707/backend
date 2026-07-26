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
