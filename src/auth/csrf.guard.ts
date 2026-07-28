import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser, IS_PUBLIC_KEY } from '../common/auth.decorators';
import { CsrfService } from './csrf.service';

interface CsrfRequest {
  method: string;
  user?: AuthenticatedUser;
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly enforced: boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly csrf: CsrfService,
    config: ConfigService,
  ) {
    this.enforced = config.get<boolean>('CSRF_ENFORCED', false);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.enforced || context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<CsrfRequest>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const user = request.user;
    if (!user || user.legacy) return true;
    const header = request.headers['x-csrf-token'];
    const candidate = Array.isArray(header) ? header[0] : header;
    if (
      !user.sessionId ||
      !(await this.csrf.verify(user.sessionId, candidate))
    ) {
      throw new ForbiddenException('Invalid CSRF token');
    }
    return true;
  }
}
