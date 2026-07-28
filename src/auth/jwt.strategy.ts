import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../common/auth.decorators';
import { UserRole } from '../shared';
import { AuthSessionService } from './auth-session.service';
import { TokenRevocationService } from './token-revocation.service';

interface JwtPayload {
  sub?: string;
  email?: string;
  roles?: UserRole[];
  sid?: string;
  jti?: string;
  exp?: number;
  iss?: string;
  aud?: string | string[];
  type?: 'access' | 'socket';
  mfa_verified?: boolean;
  amr?: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly legacyAllowed: boolean;

  constructor(
    config: ConfigService,
    private readonly sessions: AuthSessionService,
    private readonly revocations: TokenRevocationService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
    });
    this.issuer = config.get<string>('JWT_ISSUER', 'resolve-platform');
    this.audience = config.get<string>('JWT_AUDIENCE', 'resolve-platform-web');
    this.legacyAllowed = config.get<boolean>('LEGACY_JWT_ALLOWED', true);
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload.sub || !payload.email || !Array.isArray(payload.roles)) {
      throw new UnauthorizedException('Authentication required');
    }
    const isV2 = Boolean(payload.sid || payload.jti || payload.type);
    if (!isV2) {
      if (!this.legacyAllowed)
        throw new UnauthorizedException('Authentication required');
      return {
        userId: payload.sub,
        email: payload.email,
        roles: payload.roles,
        legacy: true,
      };
    }
    const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (
      payload.type !== 'access' ||
      !payload.sid ||
      !payload.jti ||
      !payload.exp ||
      payload.iss !== this.issuer ||
      !audience.includes(this.audience) ||
      (await this.revocations.isRevoked(payload.jti))
    ) {
      throw new UnauthorizedException('Authentication required');
    }
    const session = await this.sessions.validateSession(payload.sid);
    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Authentication required');
    }
    return {
      userId: payload.sub,
      email: payload.email,
      roles: payload.roles,
      sessionId: payload.sid,
      jti: payload.jti,
      exp: payload.exp,
      mfaVerified: payload.mfa_verified === true,
      amr: Array.isArray(payload.amr) ? payload.amr : [],
      tokenType: 'access',
      legacy: false,
    };
  }
}
