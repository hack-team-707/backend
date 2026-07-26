import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('push_subscriptions')
export class WebPushSubscription {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  @Index()
  userId!: string;

  @Column({ length: 64, unique: true, nullable: true })
  endpointHash?: string;

  /** AES-256-GCM encrypted endpoint. */
  @Column('text')
  endpoint!: string;

  /** AES-256-GCM encrypted browser key. */
  @Column('text')
  p256dh!: string;

  /** AES-256-GCM encrypted browser auth secret. */
  @Column('text')
  auth!: string;

  @Column('bigint', { nullable: true })
  expirationTime?: string;

  @Column({ nullable: true })
  userAgent?: string;

  @Column()
  createdAt!: string;

  @Column()
  updatedAt!: string;
}
