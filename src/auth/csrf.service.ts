import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SecurityStoreService } from './security-store.service';

@Injectable()
export class CsrfService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly store: SecurityStoreService,
    config: ConfigService,
  ) {
    this.ttlSeconds = this.durationSeconds(
      config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
    );
  }

  async issue(sessionId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.store.set(
      `auth:csrf:${sessionId}`,
      this.hash(token),
      this.ttlSeconds,
    );
    return token;
  }

  async verify(
    sessionId: string,
    candidate: string | undefined,
  ): Promise<boolean> {
    if (!candidate) return false;
    const expected = await this.store.get(`auth:csrf:${sessionId}`);
    if (!expected) return false;
    const left = Buffer.from(expected);
    const right = Buffer.from(this.hash(candidate));
    return left.length === right.length && timingSafeEqual(left, right);
  }

  revoke(sessionId: string): Promise<void> {
    return this.store.delete(`auth:csrf:${sessionId}`);
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private durationSeconds(value: string): number {
    const match = /^(\d+)(s|m|h|d)$/.exec(value);
    if (!match) throw new Error('Invalid CSRF duration');
    const unit = match[2] as 's' | 'm' | 'h' | 'd';
    return Number(match[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[unit];
  }
}
