import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentPlanInstallment } from '../payment-plans/entities/payment-plan-installment.entity';
import { ProjectPaymentPlan } from '../payment-plans/entities/project-payment-plan.entity';
import { ProjectParticipantShare } from '../payment-plans/entities/project-participant-share.entity';
import { MarketplaceFeeConfig } from '../marketplace-fees/entities/marketplace-fee-config.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { WalletLedgerEntry } from '../wallets/entities/wallet-ledger-entry.entity';
import { PaymentDistribution } from './entities/payment-distribution.entity';
import { Project } from '../projects/entities/project.entity';
import { PaymentRefund } from './entities/payment-refund.entity';
import { PaymentWebhookEvent } from './entities/payment-webhook-event.entity';
import { ProjectPayment } from './entities/project-payment.entity';
import {
  PaymentWebhooksController,
  PaymentsController,
} from './payments.controller';
import { PaymentWebhookProcessor } from './payment-webhook.processor';
import { PaymentWebhookSignatureService } from './payment-webhook-signature.service';
import { PAYMENT_WEBHOOK_QUEUE, PaymentsService } from './payments.service';
import { MercadoPagoPaymentProvider } from './providers/mercado-pago-payment.provider';
import { PAYMENT_PROVIDER } from './providers/payment-provider';

@Module({
  imports: [
    NotificationsModule,
    BullModule.registerQueue({ name: PAYMENT_WEBHOOK_QUEUE }),
    TypeOrmModule.forFeature([
      Project,
      ProjectPaymentPlan,
      ProjectParticipantShare,
      MarketplaceFeeConfig,
      PaymentPlanInstallment,
      ProjectPayment,
      PaymentDistribution,
      Wallet,
      WalletLedgerEntry,
      PaymentWebhookEvent,
      PaymentRefund,
    ]),
  ],
  controllers: [PaymentsController, PaymentWebhooksController],
  providers: [
    PaymentsService,
    PaymentWebhookProcessor,
    PaymentWebhookSignatureService,
    MercadoPagoPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      useExisting: MercadoPagoPaymentProvider,
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
