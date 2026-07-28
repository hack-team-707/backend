import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  AuthenticatedUser,
  IS_PUBLIC_KEY,
  MFA_OPTIONAL_KEY,
} from '../common/auth.decorators';

interface MfaRequest {
  user?: AuthenticatedUser;
}

@Injectable()
export class MfaGuard implements CanActivate {
  private readonly enforced: boolean;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    this.enforced = config.get<boolean>('MFA_ENFORCED', false);
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.enforced || context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isOptional = this.reflector.getAllAndOverride<boolean>(
      MFA_OPTIONAL_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic || isOptional) return true;
    const user = context.switchToHttp().getRequest<MfaRequest>().user;
    if (user?.legacy) return true;
    if (!user?.mfaVerified) {
      throw new ForbiddenException('MFA verification required');
    }
    return true;
  }
}
