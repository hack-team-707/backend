import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AuthenticatedUser,
  IS_PUBLIC_KEY,
  ROLES_KEY,
} from '../common/auth.decorators';
import { UserRole } from '../shared';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    return required.some((role) => request.user?.roles.includes(role));
  }
}
