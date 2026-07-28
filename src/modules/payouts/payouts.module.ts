import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectPayment } from '../payments/entities/project-payment.entity';
import { WithdrawalRequest } from '../withdrawals/entities/withdrawal-request.entity';
import { WithdrawalsModule } from '../withdrawals/withdrawals.module';
import { Payout } from './entities/payout.entity';
import {
  FinanceAdminController,
  PayoutsController,
} from './payouts.controller';
import { PayoutsService } from './payouts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payout, WithdrawalRequest, ProjectPayment]),
    WithdrawalsModule,
  ],
  controllers: [PayoutsController, FinanceAdminController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
