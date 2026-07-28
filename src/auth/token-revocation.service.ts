import { Injectable } from '@nestjs/common';
import { SecurityStoreService } from './security-store.service';

@Injectable()
export class TokenRevocationService {
  constructor(private readonly store: SecurityStoreService) {}

  async revoke(jti: string, expiresAtSeconds: number): Promise<void> {
    const ttl = Math.max(1, expiresAtSeconds - Math.floor(Date.now() / 1000));
    await this.store.set(`auth:revoked:access:${jti}`, '1', ttl);
  }

  async isRevoked(jti: string): Promise<boolean> {
    return Boolean(await this.store.get(`auth:revoked:access:${jti}`));
  }

  async consumeSocketTicket(
    jti: string,
    expiresAtSeconds: number,
  ): Promise<boolean> {
    const ttl = Math.max(1, expiresAtSeconds - Math.floor(Date.now() / 1000));
    return this.store.setIfAbsent(`auth:socket:used:${jti}`, '1', ttl);
  }
}
