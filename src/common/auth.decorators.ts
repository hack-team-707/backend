import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { UserRole } from '../shared';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const MFA_OPTIONAL_KEY = 'mfaOptional';
export const MfaOptional = () => SetMetadata(MFA_OPTIONAL_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthenticatedUser {
  userId: string;
  email: string;
  roles: UserRole[];
  sessionId?: string;
  jti?: string;
  exp?: number;
  mfaVerified?: boolean;
  amr?: string[];
  tokenType?: 'access' | 'socket';
  legacy?: boolean;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<{
      user: AuthenticatedUser;
    }>();
    return request.user;
  },
);
