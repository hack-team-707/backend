import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketplaceFeeConfig } from '../marketplace-fees/entities/marketplace-fee-config.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { Project } from '../projects/entities/project.entity';
import { Problem } from '../problems/entities/problem.entity';
import { PaymentPlanInstallment } from './entities/payment-plan-installment.entity';
import { ProjectParticipantShare } from './entities/project-participant-share.entity';
import { ProjectPaymentPlan } from './entities/project-payment-plan.entity';
import { PaymentPlansController } from './payment-plans.controller';
import { PaymentPlansService } from './payment-plans.service';

@Module({
  imports: [
    NotificationsModule,
    TypeOrmModule.forFeature([
      Project,
      Problem,
      MarketplaceFeeConfig,
      ProjectPaymentPlan,
      PaymentPlanInstallment,
      ProjectParticipantShare,
    ]),
  ],
  controllers: [PaymentPlansController],
  providers: [PaymentPlansService],
  exports: [PaymentPlansService],
})
export class PaymentPlansModule {}
