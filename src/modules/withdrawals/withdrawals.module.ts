import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WithdrawalRequest } from './entities/withdrawal-request.entity';
import { WithdrawalsService } from './withdrawals.service';
import {
  WithdrawalsController,
  AdminWithdrawalsController,
} from './withdrawals.controller';
import { WalletsModule } from '../wallets/wallets.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WithdrawalRequest]),
    WalletsModule,
    NotificationsModule,
  ],
  controllers: [WithdrawalsController, AdminWithdrawalsController],
  providers: [WithdrawalsService],
  exports: [WithdrawalsService],
})
export class WithdrawalsModule {}
