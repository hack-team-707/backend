import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';
import { PaymentProvider, PaymentWebhookStatus } from '../../../shared';

@Entity('payment_webhook_events')
@Unique('UQ_payment_webhook_events_provider_event', [
  'provider',
  'providerEventId',
])
export class PaymentWebhookEvent {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('varchar')
  provider!: PaymentProvider;

  @Column('varchar', { length: 255 })
  providerEventId!: string;

  @Column('varchar', { length: 120 })
  eventType!: string;

  @Column('jsonb')
  payload!: Record<string, unknown>;

  @Column('varchar')
  @Index()
  status!: PaymentWebhookStatus;

  @Column('integer', { default: 0 })
  attemptCount!: number;

  @Column('varchar', { length: 2000, nullable: true })
  lastError?: string | null;

  @Column('timestamptz')
  @Index()
  receivedAt!: Date;

  @Column('timestamptz', { nullable: true })
  processedAt?: Date | null;
}
