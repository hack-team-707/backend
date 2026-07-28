import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import {
  MERCADO_PAGO_WEBHOOK_JOB,
  PAYMENT_WEBHOOK_QUEUE,
  PaymentsService,
} from './payments.service';

interface PaymentWebhookJob {
  eventId: string;
}

@Processor(PAYMENT_WEBHOOK_QUEUE)
export class PaymentWebhookProcessor {
  constructor(private readonly payments: PaymentsService) {}

  @Process(MERCADO_PAGO_WEBHOOK_JOB)
  process(job: Job<PaymentWebhookJob>): Promise<void> {
    return this.payments.processWebhookEvent(job.data.eventId);
  }
}
