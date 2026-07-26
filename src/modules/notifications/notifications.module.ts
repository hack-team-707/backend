import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../../auth/auth.module';
import { Notification } from './entities/notification.entity';
import { WebPushSubscription } from './entities/push-subscription.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationGateway } from './notification.gateway';
import { PushDeliveryService } from './push-delivery.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, WebPushSubscription]),
    AuthModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationGateway, PushDeliveryService],
  exports: [NotificationsService, NotificationGateway],
})
export class NotificationsModule {}
