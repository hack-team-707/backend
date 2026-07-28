import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { SecurityStoreService } from './security-store.service';

interface RateLimitedRequest {
  ip?: string;
  method: string;
  path?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly defaultLimit: number;
  private readonly authLimit: number;
  private readonly windowSeconds: number;

  constructor(
    private readonly store: SecurityStoreService,
    config: ConfigService,
  ) {
    this.defaultLimit = config.get<number>('RATE_LIMIT_MAX', 120);
    this.authLimit = config.get<number>('AUTH_RATE_LIMIT_MAX', 10);
    this.windowSeconds = config.get<number>('RATE_LIMIT_WINDOW_SECONDS', 60);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<RateLimitedRequest>();
    const route = request.path ?? request.url ?? 'unknown';
    const isSensitiveAuthRoute =
      /^\/(?:api\/)?auth\/(login|register|refresh|mfa\/verify)/.test(route);
    const limit = isSensitiveAuthRoute ? this.authLimit : this.defaultLimit;
    const clientAddress = this.clientAddress(request);
    const key = createHash('sha256')
      .update(`${clientAddress}:${request.method}:${route.split('?')[0]}`)
      .digest('hex');
    const count = await this.store.increment(
      `rate-limit:${key}`,
      this.windowSeconds,
    );
    if (count > limit) {
      throw new HttpException(
        'Too many requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private clientAddress(request: RateLimitedRequest): string {
    const forwarded = request.headers['x-forwarded-for'];
    const candidate = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return candidate?.split(',')[0]?.trim() || request.ip || 'unknown';
  }
}
