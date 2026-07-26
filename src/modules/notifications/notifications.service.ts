import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import {
  CreateNotificationInput,
  Notification,
} from './entities/notification.entity';
import { NotificationGateway } from './notification.gateway';
import { PushDeliveryService } from './push-delivery.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    private readonly gateway: NotificationGateway,
    private readonly push: PushDeliveryService,
  ) {}

  findMine(userId: string): Promise<Notification[]> {
    return this.notifications.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.notifications.count({
      where: { userId, read: false },
    });
    return { count };
  }

  async markRead(userId: string, id: string): Promise<Notification> {
    const notification = await this.notifications.findOneBy({ id });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.userId !== userId)
      throw new ForbiddenException('Notification does not belong to user');
    if (!notification.read) {
      this.notifications.merge(notification, { read: true });
      await this.notifications.save(notification);
    }
    return notification;
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const unread = await this.notifications.find({
      where: { userId, read: false },
    });
    if (!unread.length) return { updated: 0 };
    unread.forEach((notification) =>
      this.notifications.merge(notification, { read: true }),
    );
    await this.notifications.save(unread);
    return { updated: unread.length };
  }

  async createForUsers(
    userIds: string[],
    input: Omit<CreateNotificationInput, 'userId'>,
    excludeUserId?: string,
  ): Promise<Notification[]> {
    const recipients = [...new Set(userIds)].filter(
      (userId) => userId && userId !== excludeUserId,
    );
    return Promise.all(
      recipients.map((userId) => this.create({ ...input, userId })),
    );
  }

  async createSafely(input: CreateNotificationInput): Promise<void> {
    try {
      await this.create(input);
    } catch (error) {
      this.logger.warn(
        `Notification persistence failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async createForUsersSafely(
    userIds: string[],
    input: Omit<CreateNotificationInput, 'userId'>,
    excludeUserId?: string,
  ): Promise<void> {
    try {
      await this.createForUsers(userIds, input, excludeUserId);
    } catch (error) {
      this.logger.warn(
        `Notification batch persistence failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async create(input: CreateNotificationInput): Promise<Notification> {
    const notification = await this.notifications.save(
      this.notifications.create({
        id: randomUUID(),
        ...input,
        title: input.title.trim(),
        message: input.message.trim(),
        read: false,
        createdAt: new Date().toISOString(),
      }),
    );
    this.gateway.emitNotification(notification);
    void this.push
      .send(notification)
      .catch((error: unknown) =>
        this.logger.warn(
          `Push dispatch failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        ),
      );
    return notification;
  }
}
