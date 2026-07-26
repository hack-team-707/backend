import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { Repository } from 'typeorm';
import * as webPush from 'web-push';
import { Notification } from './entities/notification.entity';
import { WebPushSubscription } from './entities/push-subscription.entity';

export interface PushConfiguration {
  enabled: boolean;
  publicKey?: string;
  keyId?: string;
}

export interface BrowserPushSubscription {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
}

@Injectable()
export class PushDeliveryService {
  private readonly logger = new Logger(PushDeliveryService.name);
  private readonly publicKey?: string;
  private readonly keyId?: string;
  private readonly encryptionKey: Buffer;
  private readonly enabled: boolean;

  constructor(
    @InjectRepository(WebPushSubscription)
    private readonly subscriptions: Repository<WebPushSubscription>,
    config: ConfigService,
  ) {
    const subject = config.get<string>('VAPID_SUBJECT');
    const publicKey = config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY');
    this.publicKey = publicKey;
    this.keyId = publicKey
      ? createHash('sha256').update(publicKey).digest('hex').slice(0, 16)
      : undefined;
    this.encryptionKey = Buffer.from(
      config.getOrThrow<string>('DATA_ENCRYPTION_KEY'),
      'hex',
    );
    this.enabled = Boolean(subject && publicKey && privateKey);
    if (this.enabled) {
      webPush.setVapidDetails(subject!, publicKey!, privateKey!);
    } else {
      this.logger.warn(
        'Web Push is disabled because VAPID_SUBJECT, VAPID_PUBLIC_KEY, or VAPID_PRIVATE_KEY is missing',
      );
    }
  }

  configuration(): PushConfiguration {
    return {
      enabled: this.enabled,
      ...(this.enabled && this.publicKey
        ? { publicKey: this.publicKey, keyId: this.keyId }
        : {}),
    };
  }

  async subscribe(
    userId: string,
    subscription: BrowserPushSubscription,
    userAgent?: string,
  ): Promise<{ subscribed: true }> {
    if (!this.enabled) {
      throw new ServiceUnavailableException('Web Push is not configured');
    }
    this.assertSafeEndpoint(subscription.endpoint);
    if (
      subscription.expirationTime !== null &&
      subscription.expirationTime !== undefined &&
      subscription.expirationTime <= Date.now()
    ) {
      throw new BadRequestException('Push subscription is expired');
    }
    const endpointHash = this.hash(subscription.endpoint);
    const current = await this.subscriptions.findOneBy({ endpointHash });
    const now = new Date().toISOString();
    const entity =
      current ??
      this.subscriptions.create({
        id: randomUUID(),
        endpointHash,
        createdAt: now,
      });
    this.subscriptions.merge(entity, {
      userId,
      endpoint: this.encrypt(subscription.endpoint),
      p256dh: this.encrypt(subscription.keys.p256dh),
      auth: this.encrypt(subscription.keys.auth),
      ...(subscription.expirationTime
        ? { expirationTime: String(Math.trunc(subscription.expirationTime)) }
        : { expirationTime: undefined }),
      ...(userAgent?.trim()
        ? { userAgent: userAgent.trim().slice(0, 512) }
        : {}),
      updatedAt: now,
    });
    await this.subscriptions.save(entity);
    return { subscribed: true };
  }

  async unsubscribe(
    userId: string,
    endpoint: string,
  ): Promise<{ subscribed: false }> {
    await this.subscriptions.delete({
      userId,
      endpointHash: this.hash(endpoint),
    });
    return { subscribed: false };
  }

  async send(notification: Notification): Promise<void> {
    if (!this.enabled) return;
    const subscriptions = await this.subscriptions.find({
      where: { userId: notification.userId },
    });
    const now = Date.now();
    const stale = subscriptions.filter(
      (subscription) =>
        !subscription.endpointHash ||
        !subscription.endpoint.startsWith('v1.') ||
        !subscription.p256dh.startsWith('v1.') ||
        !subscription.auth.startsWith('v1.') ||
        (subscription.expirationTime &&
          Number(subscription.expirationTime) <= now),
    );
    if (stale.length) {
      await this.subscriptions.delete(stale.map(({ id }) => id));
    }
    const active = subscriptions.filter(
      (subscription) => !stale.some(({ id }) => id === subscription.id),
    );
    if (!active.length) return;
    const payload = JSON.stringify({
      title: notification.title,
      body: notification.message,
      icon: '/icons/resolve-icon.svg',
      badge: '/icons/resolve-icon.svg',
      tag: `resolve-${notification.type}-${notification.id}`,
      data: {
        notificationId: notification.id,
        type: notification.type,
        href: notification.href ?? '/notifications',
      },
    });
    await Promise.allSettled(
      active.map((subscription) => this.deliver(subscription, payload)),
    );
  }

  private assertSafeEndpoint(endpoint: string): void {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    const allowed = [
      'fcm.googleapis.com',
      'web.push.apple.com',
      'updates.push.services.mozilla.com',
      'notify.windows.com',
    ];
    if (
      !allowed.some(
        (host) => hostname === host || hostname.endsWith(`.${host}`),
      )
    ) {
      throw new BadRequestException('Unsupported Web Push endpoint');
    }
  }

  private async deliver(
    subscription: WebPushSubscription,
    payload: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await webPush.sendNotification(
          {
            endpoint: this.decrypt(subscription.endpoint),
            expirationTime: subscription.expirationTime
              ? Number(subscription.expirationTime)
              : null,
            keys: {
              p256dh: this.decrypt(subscription.p256dh),
              auth: this.decrypt(subscription.auth),
            },
          },
          payload,
          { TTL: 60 * 60 * 24, urgency: 'high' },
        );
        return;
      } catch (error) {
        const statusCode =
          error && typeof error === 'object' && 'statusCode' in error
            ? Number(error.statusCode)
            : undefined;
        if ([401, 403, 404, 410].includes(statusCode ?? 0)) {
          await this.subscriptions.delete({ id: subscription.id });
          return;
        }
        const retryable =
          statusCode === undefined || statusCode === 429 || statusCode >= 500;
        if (retryable && attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, 250 * 2 ** attempt),
          );
          continue;
        }
        this.logger.warn(
          `Push delivery failed${statusCode ? ` with status ${statusCode}` : ''}`,
        );
        return;
      }
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  private decrypt(payload: string): string {
    const [version, encodedIv, encodedTag, encodedCiphertext] =
      payload.split('.');
    if (version !== 'v1' || !encodedIv || !encodedTag || !encodedCiphertext) {
      throw new Error('Invalid encrypted push subscription');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(encodedIv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
