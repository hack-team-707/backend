import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../../common/auth.decorators';
import {
  RemovePushSubscriptionDto,
  SavePushSubscriptionDto,
} from './dto/push-subscription.dto';
import { Notification } from './entities/notification.entity';
import {
  PushConfiguration,
  PushDeliveryService,
} from './push-delivery.service';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly push: PushDeliveryService,
  ) {}

  @Get('push/config')
  pushConfiguration(): PushConfiguration {
    return this.push.configuration();
  }

  @Post('push/subscriptions')
  subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SavePushSubscriptionDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<{ subscribed: true }> {
    return this.push.subscribe(user.userId, dto, userAgent);
  }

  @Delete('push/subscriptions')
  unsubscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RemovePushSubscriptionDto,
  ): Promise<{ subscribed: false }> {
    return this.push.unsubscribe(user.userId, dto.endpoint);
  }

  @Get()
  findMine(@CurrentUser() user: AuthenticatedUser): Promise<Notification[]> {
    return this.service.findMine(user.userId);
  }

  @Get('unread-count')
  unreadCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ count: number }> {
    return this.service.unreadCount(user.userId);
  }

  @Patch('read-all')
  markAllRead(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ updated: number }> {
    return this.service.markAllRead(user.userId);
  }

  @Patch(':id/read')
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Notification> {
    return this.service.markRead(user.userId, id);
  }
}
