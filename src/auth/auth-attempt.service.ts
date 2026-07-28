import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { SecurityStoreService } from './security-store.service';

@Injectable()
export class AuthAttemptService {
  static readonly WINDOW_SECONDS = 15 * 60;
  static readonly BLOCK_SECONDS = 15 * 60;
  static readonly MAX_FAILURES = 5;

  constructor(private readonly store: SecurityStoreService) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  async assertAllowed(email: string, ipAddress: string): Promise<void> {
    const accountHash = this.hash(this.normalizeEmail(email));
    const ipHash = this.hash(ipAddress || 'unknown');
    const [accountBlocked, ipFailures] = await Promise.all([
      this.store.get(`auth:blocked:account:${accountHash}`),
      this.store.get(`auth:failed:ip:${ipHash}`),
    ]);
    if (
      accountBlocked ||
      Number(ipFailures ?? 0) > AuthAttemptService.MAX_FAILURES
    ) {
      throw new HttpException(
        'Credenciales inválidas o acceso no permitido',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordFailure(
    email: string,
    ipAddress: string,
  ): Promise<{ locked: boolean; accountHash: string; ipHash: string }> {
    const accountHash = this.hash(this.normalizeEmail(email));
    const ipHash = this.hash(ipAddress || 'unknown');
    const [accountFailures] = await Promise.all([
      this.store.increment(
        `auth:failed:account:${accountHash}`,
        AuthAttemptService.WINDOW_SECONDS,
      ),
      this.store.increment(
        `auth:failed:ip:${ipHash}`,
        AuthAttemptService.WINDOW_SECONDS,
      ),
    ]);
    const locked = accountFailures >= AuthAttemptService.MAX_FAILURES;
    if (locked) {
      await this.store.set(
        `auth:blocked:account:${accountHash}`,
        '1',
        AuthAttemptService.BLOCK_SECONDS,
      );
    }
    return { locked, accountHash, ipHash };
  }

  async recordSuccess(email: string): Promise<void> {
    const accountHash = this.hash(this.normalizeEmail(email));
    await this.store.delete(
      `auth:failed:account:${accountHash}`,
      `auth:blocked:account:${accountHash}`,
    );
  }
}
