import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Queue from 'bull';

interface MemoryValue {
  value: string;
  expiresAt: number;
}

@Injectable()
export class SecurityStoreService implements OnModuleDestroy {
  private readonly memory = new Map<string, MemoryValue>();
  private readonly queue?: Queue.Queue;

  constructor(config: ConfigService) {
    const redisUrl = config.get<string>('REDIS_URL');
    if (redisUrl) {
      this.queue = new Queue('auth-security-store', redisUrl, {
        defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
      });
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.queue) return this.queue.client.get(key);
    const item = this.memory.get(key);
    if (!item || item.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.queue) {
      await this.queue.client.set(key, value, 'EX', Math.max(1, ttlSeconds));
      return;
    }
    this.memory.set(key, {
      value,
      expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000,
    });
  }

  async setIfAbsent(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (this.queue) {
      return (
        (await this.queue.client.set(
          key,
          value,
          'EX',
          Math.max(1, ttlSeconds),
          'NX',
        )) === 'OK'
      );
    }
    if (await this.get(key)) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    if (this.queue) {
      const value = await this.queue.client.incr(key);
      if (value === 1) await this.queue.client.expire(key, ttlSeconds);
      return value;
    }
    const current = Number((await this.get(key)) ?? 0) + 1;
    await this.set(key, String(current), ttlSeconds);
    return current;
  }

  async delete(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    if (this.queue) {
      await this.queue.client.del(...keys);
      return;
    }
    keys.forEach((key) => this.memory.delete(key));
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
