import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { UserRole } from '../shared';
import {
  PublicUser,
  toPublicUser,
  User,
} from '../modules/users/entities/user.entity';
import { UsersService } from '../modules/users/users.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { AuthenticatedUser } from '../common/auth.decorators';
import { PasswordService } from './password.service';
import { AuthAttemptService } from './auth-attempt.service';
import { AuthAuditService } from './auth-audit.service';
import { AuthSessionService, SessionContext } from './auth-session.service';
import { CsrfService } from './csrf.service';
import { MfaService } from './mfa.service';
import { SessionDisconnectService } from './session-disconnect.service';
import { TokenRevocationService } from './token-revocation.service';

export interface AuthRequestContext extends SessionContext {
  correlationId?: string;
}

export interface AuthResponse {
  accessToken?: string;
  refreshToken?: string;
  csrfToken?: string;
  user: PublicUser;
  mfaRequired?: boolean;
  mfaEnrollmentRequired?: boolean;
  challengeId?: string;
}

@Injectable()
export class AuthService {
  private readonly sessionV2: boolean;
  private readonly refreshEnabled: boolean;
  private readonly csrfEnforced: boolean;
  private readonly mfaEnforced: boolean;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly accessExpiresIn: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly attempts: AuthAttemptService,
    private readonly audit: AuthAuditService,
    private readonly sessions: AuthSessionService,
    private readonly csrf: CsrfService,
    private readonly mfa: MfaService,
    private readonly revocations: TokenRevocationService,
    private readonly disconnects: SessionDisconnectService,
  ) {
    this.sessionV2 = config.get<boolean>('AUTH_SESSION_V2_ENABLED', false);
    this.refreshEnabled = config.get<boolean>('REFRESH_TOKEN_ENABLED', false);
    this.csrfEnforced = config.get<boolean>('CSRF_ENFORCED', false);
    this.mfaEnforced = config.get<boolean>('MFA_ENFORCED', false);
    this.issuer = config.get<string>('JWT_ISSUER', 'resolve-platform');
    this.audience = config.get<string>('JWT_AUDIENCE', 'resolve-platform-web');
    this.accessExpiresIn = config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');
  }

  async register(
    dto: RegisterDto,
    context: AuthRequestContext = {},
  ): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();
    if (await this.usersService.findByEmail(email)) {
      throw new ConflictException('Unable to create account');
    }
    const now = new Date().toISOString();
    const user: User = {
      id: randomUUID(),
      email,
      displayName: dto.displayName.trim(),
      passwordHash: await this.passwordService.hash(dto.password),
      passwordAlgorithm: 'bcrypt',
      mfaEnabled: false,
      roles: [UserRole.REQUESTER, UserRole.SOLVER],
      createdAt: now,
      updatedAt: now,
    };
    await this.usersService.create(user);
    return this.completeLogin(user, context, false);
  }

  async login(
    dto: LoginDto,
    context: AuthRequestContext = {},
  ): Promise<AuthResponse> {
    const email = this.attempts.normalizeEmail(dto.email);
    await this.attempts.assertAllowed(email, context.ipAddress ?? 'unknown');
    const user = await this.usersService.findByEmail(email);
    const verification = user
      ? await this.passwordService.verifyWithMigration(
          dto.password,
          user.passwordHash,
        )
      : { valid: false, needsRehash: false };
    if (!user || !verification.valid) {
      const failure = await this.attempts.recordFailure(
        email,
        context.ipAddress ?? 'unknown',
      );
      await this.audit.record({
        eventType: failure.locked ? 'AUTH_ACCOUNT_LOCKED' : 'AUTH_LOGIN_FAILED',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.correlationId,
        outcome: failure.locked ? 'blocked' : 'failure',
      });
      throw new UnauthorizedException(
        'Credenciales inválidas o acceso no permitido',
      );
    }
    await this.attempts.recordSuccess(email);
    if (verification.needsRehash) {
      user.passwordHash = await this.passwordService.hash(dto.password);
      user.passwordAlgorithm = 'bcrypt';
      user.updatedAt = new Date().toISOString();
      await this.usersService.save(user);
      await this.audit.record({
        eventType: 'AUTH_PASSWORD_REHASHED',
        userId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.correlationId,
        outcome: 'success',
      });
    }
    if (user.mfaEnabled) {
      const challengeId = await this.mfa.createChallenge(user.id);
      return {
        user: toPublicUser(user),
        mfaRequired: true,
        challengeId,
      };
    }
    return this.completeLogin(user, context, false);
  }

  async verifyMfa(
    challengeId: string,
    code: string,
    context: AuthRequestContext = {},
  ): Promise<AuthResponse> {
    try {
      const userId = await this.mfa.verifyChallenge(challengeId, code);
      const user = await this.usersService.findById(userId);
      if (!user) throw new ForbiddenException('MFA verification failed');
      return this.completeLogin(user, context, true);
    } catch (error) {
      await this.audit.record({
        eventType: 'AUTH_MFA_FAILED',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.correlationId,
        outcome: 'failure',
      });
      throw error;
    }
  }

  async issueSocketTicket(
    user: AuthenticatedUser,
  ): Promise<{ ticket: string }> {
    const jti = randomUUID();
    const ticket = await this.jwtService.signAsync(
      {
        sub: user.userId,
        sid: user.sessionId,
        jti,
        type: 'socket',
        purpose: 'socket',
      },
      {
        algorithm: 'HS256',
        issuer: this.issuer,
        audience: this.audience,
        expiresIn: '60s',
      },
    );
    return { ticket };
  }

  async refresh(
    presented: string,
    csrfCandidate?: string,
  ): Promise<AuthResponse> {
    if (!this.sessionV2 || !this.refreshEnabled) {
      throw new UnauthorizedException('Authentication required');
    }
    if (this.csrfEnforced) {
      const refreshSession =
        await this.sessions.resolveRefreshSession(presented);
      if (
        !refreshSession ||
        !(await this.csrf.verify(refreshSession.id, csrfCandidate))
      ) {
        throw new ForbiddenException('Invalid CSRF token');
      }
    }
    const rotation = await this.sessions.rotate(presented);
    if (rotation.reused) {
      await this.disconnects.disconnect(rotation.session.id);
      await this.audit.record({
        eventType: 'AUTH_REFRESH_REUSE_DETECTED',
        userId: rotation.session.userId,
        sessionId: rotation.session.id,
        outcome: 'blocked',
      });
      throw new UnauthorizedException('Authentication required');
    }
    const user = await this.usersService.findById(rotation.session.userId);
    if (!user) throw new UnauthorizedException('Authentication required');
    const accessToken = await this.signAccess(
      user,
      rotation.session.id,
      Boolean(rotation.session.mfaVerifiedAt),
    );
    const csrfToken = await this.csrf.issue(rotation.session.id);
    await this.audit.record({
      eventType: 'AUTH_REFRESH_ROTATED',
      userId: user.id,
      sessionId: rotation.session.id,
      outcome: 'success',
    });
    return {
      accessToken,
      refreshToken: rotation.refreshToken,
      csrfToken,
      user: toPublicUser(user),
    };
  }

  async logout(user: AuthenticatedUser): Promise<void> {
    if (user.jti && user.exp) await this.revocations.revoke(user.jti, user.exp);
    if (user.sessionId) {
      await this.sessions.revokeSession(user.sessionId, 'logout', user.userId);
      await this.csrf.revoke(user.sessionId);
      await this.disconnects.disconnect(user.sessionId);
    }
    await this.audit.record({
      eventType: 'AUTH_LOGOUT',
      userId: user.userId,
      sessionId: user.sessionId,
      outcome: 'success',
    });
  }

  async logoutAll(user: AuthenticatedUser): Promise<void> {
    if (user.jti && user.exp) await this.revocations.revoke(user.jti, user.exp);
    const revokedSessionIds = this.sessionV2
      ? await this.sessions.revokeAll(user.userId, 'logout_all')
      : [];
    await Promise.all(
      revokedSessionIds.map((sessionId) => this.csrf.revoke(sessionId)),
    );
    await this.disconnects.disconnectMany(revokedSessionIds);
    await this.audit.record({
      eventType: 'AUTH_LOGOUT_ALL',
      userId: user.userId,
      sessionId: user.sessionId,
      outcome: 'success',
    });
  }

  async listSessions(user: AuthenticatedUser) {
    if (!this.sessionV2) return [];
    const sessions = await this.sessions.listUserSessions(user.userId);
    return sessions.map((session) => ({
      id: session.id,
      current: session.id === user.sessionId,
      userAgent: session.userAgent ?? undefined,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      mfaVerified: Boolean(session.mfaVerifiedAt),
    }));
  }

  async revokeSession(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<void> {
    if (!this.sessionV2)
      throw new ForbiddenException('Session security is not enabled');
    await this.sessions.revokeSession(sessionId, 'user_revoked', user.userId);
    await this.csrf.revoke(sessionId);
    await this.disconnects.disconnect(sessionId);
    await this.audit.record({
      eventType: 'AUTH_SESSION_REVOKED',
      userId: user.userId,
      sessionId,
      outcome: 'success',
    });
  }

  issueCsrf(user: AuthenticatedUser): Promise<string> {
    if (!user.sessionId)
      throw new ForbiddenException('Session security is not enabled');
    return this.csrf.issue(user.sessionId);
  }

  async startMfaSetup(
    user: AuthenticatedUser,
  ): Promise<{ otpauthUri: string }> {
    const setup = await this.mfa.startSetup(user.userId);
    await this.audit.record({
      eventType: 'AUTH_MFA_ENROLLMENT_STARTED',
      userId: user.userId,
      sessionId: user.sessionId,
      outcome: 'success',
    });
    return setup;
  }

  async confirmMfaSetup(
    authenticated: AuthenticatedUser,
    code: string,
  ): Promise<AuthResponse> {
    if (!authenticated.sessionId) {
      throw new ForbiddenException('Session security is not enabled');
    }
    await this.mfa.confirmSetup(authenticated.userId, code);
    await this.sessions.markMfaVerified(
      authenticated.sessionId,
      authenticated.userId,
    );
    const user = await this.usersService.findById(authenticated.userId);
    if (!user) throw new UnauthorizedException('Authentication required');
    const accessToken = await this.signAccess(
      user,
      authenticated.sessionId,
      true,
    );
    const csrfToken = await this.csrf.issue(authenticated.sessionId);
    await this.audit.record({
      eventType: 'AUTH_MFA_ENROLLMENT_CONFIRMED',
      userId: authenticated.userId,
      sessionId: authenticated.sessionId,
      outcome: 'success',
    });
    return { accessToken, csrfToken, user: toPublicUser(user) };
  }

  private async completeLogin(
    user: User,
    context: AuthRequestContext,
    mfaVerified: boolean,
  ): Promise<AuthResponse> {
    if (!this.sessionV2) {
      const accessToken = await this.jwtService.signAsync(
        { sub: user.id, email: user.email, roles: user.roles },
        { expiresIn: this.accessExpiresIn },
      );
      await this.audit.record({
        eventType: 'AUTH_LOGIN_SUCCESS',
        userId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.correlationId,
        outcome: 'success',
        metadata: { legacy: true },
      });
      return { accessToken, user: toPublicUser(user) };
    }
    const { session, evictedSessionId } = await this.sessions.createSession(
      user.id,
      { ...context, mfaVerified },
    );
    const accessToken = await this.signAccess(user, session.id, mfaVerified);
    const refresh = this.refreshEnabled
      ? await this.sessions.issueRefresh(session.id)
      : undefined;
    const csrfToken = await this.csrf.issue(session.id);
    if (evictedSessionId) {
      await this.csrf.revoke(evictedSessionId);
      await this.disconnects.disconnect(evictedSessionId);
    }
    await this.audit.record({
      eventType: 'AUTH_LOGIN_SUCCESS',
      userId: user.id,
      sessionId: session.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
      outcome: 'success',
      metadata: {
        mfaVerified,
        ...(evictedSessionId ? { sessionLimitReached: true } : {}),
      },
    });
    return {
      accessToken,
      ...(refresh ? { refreshToken: refresh.refreshToken } : {}),
      csrfToken,
      user: toPublicUser(user),
      ...(this.mfaEnforced && !user.mfaEnabled
        ? { mfaEnrollmentRequired: true }
        : {}),
    };
  }

  private signAccess(
    user: User,
    sessionId: string,
    mfaVerified: boolean,
  ): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        sid: sessionId,
        jti: randomUUID(),
        email: user.email,
        roles: user.roles,
        type: 'access',
        mfa_verified: mfaVerified,
        amr: mfaVerified ? ['pwd', 'otp'] : ['pwd'],
      },
      {
        algorithm: 'HS256',
        issuer: this.issuer,
        audience: this.audience,
        expiresIn: this.accessExpiresIn,
      },
    );
  }
}
