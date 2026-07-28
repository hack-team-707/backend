import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import { AuthSession } from './entities/auth-session.entity';
import { RefreshToken } from './entities/refresh-token.entity';

export interface SessionContext {
  ipAddress?: string;
  userAgent?: string;
  mfaVerified?: boolean;
}

export interface RefreshCredential {
  refreshToken: string;
  tokenId: string;
  familyId: string;
  expiresAt: string;
}

export interface RotationResult extends RefreshCredential {
  session: AuthSession;
  reused: boolean;
}

@Injectable()
export class AuthSessionService {
  private readonly refreshSeconds: number;

  constructor(
    @InjectRepository(AuthSession)
    private readonly sessions: Repository<AuthSession>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.refreshSeconds = this.durationSeconds(
      config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
    );
  }

  async createSession(
    userId: string,
    context: SessionContext,
  ): Promise<{ session: AuthSession; evictedSessionId?: string }> {
    const now = new Date();
    const active = await this.sessions.find({
      where: {
        userId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(now.toISOString()),
      },
      order: { lastUsedAt: 'ASC' },
    });
    let evictedSessionId: string | undefined;
    if (active.length >= 5) {
      const oldest = active[0];
      await this.revokeSession(oldest.id, 'session_limit_reached');
      evictedSessionId = oldest.id;
    }
    const nowIso = now.toISOString();
    const session = await this.sessions.save(
      this.sessions.create({
        id: randomUUID(),
        userId,
        ...(context.ipAddress
          ? { ipAddressHash: this.hash(context.ipAddress) }
          : {}),
        ...(context.userAgent
          ? { userAgent: context.userAgent.slice(0, 500) }
          : {}),
        createdAt: nowIso,
        lastUsedAt: nowIso,
        expiresAt: new Date(
          now.getTime() + this.refreshSeconds * 1000,
        ).toISOString(),
        ...(context.mfaVerified ? { mfaVerifiedAt: nowIso } : {}),
      }),
    );
    return { session, ...(evictedSessionId ? { evictedSessionId } : {}) };
  }

  async issueRefresh(
    sessionId: string,
    familyId = randomUUID(),
    parentTokenId?: string,
  ): Promise<RefreshCredential> {
    const raw = randomBytes(48).toString('base64url');
    const now = new Date();
    const token = await this.refreshTokens.save(
      this.refreshTokens.create({
        id: randomUUID(),
        sessionId,
        familyId,
        ...(parentTokenId ? { parentTokenId } : {}),
        tokenHash: this.hash(raw),
        createdAt: now.toISOString(),
        expiresAt: new Date(
          now.getTime() + this.refreshSeconds * 1000,
        ).toISOString(),
      }),
    );
    return {
      refreshToken: `${token.id}.${raw}`,
      tokenId: token.id,
      familyId,
      expiresAt: token.expiresAt,
    };
  }

  async resolveRefreshSession(presented: string): Promise<AuthSession | null> {
    const [tokenId, raw] = presented.split('.');
    if (!tokenId || !raw) return null;
    const token = await this.refreshTokens.findOneBy({ id: tokenId });
    const now = new Date().toISOString();
    if (
      !token ||
      token.tokenHash !== this.hash(raw) ||
      token.consumedAt ||
      token.revokedAt ||
      token.expiresAt <= now
    ) {
      return null;
    }
    return this.validateSession(token.sessionId);
  }

  async rotate(presented: string): Promise<RotationResult> {
    const [tokenId, raw] = presented.split('.');
    if (!tokenId || !raw)
      throw new UnauthorizedException('Authentication required');
    return this.dataSource.transaction(async (manager) => {
      const tokenRepository = manager.getRepository(RefreshToken);
      const sessionRepository = manager.getRepository(AuthSession);
      const token = await tokenRepository.findOne({
        where: { id: tokenId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!token || token.tokenHash !== this.hash(raw))
        throw new UnauthorizedException('Authentication required');
      const session = await sessionRepository.findOne({
        where: { id: token.sessionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session) throw new UnauthorizedException('Authentication required');
      const now = new Date().toISOString();
      if (token.consumedAt) {
        await tokenRepository.update(
          { familyId: token.familyId, revokedAt: IsNull() },
          { revokedAt: now },
        );
        session.revokedAt = now;
        session.revocationReason = 'refresh_reuse_detected';
        await sessionRepository.save(session);
        return {
          refreshToken: '',
          tokenId: token.id,
          familyId: token.familyId,
          expiresAt: token.expiresAt,
          session,
          reused: true,
        };
      }
      if (
        token.revokedAt ||
        token.expiresAt <= now ||
        session.revokedAt ||
        session.expiresAt <= now
      )
        throw new UnauthorizedException('Authentication required');
      const rawReplacement = randomBytes(48).toString('base64url');
      const replacement = tokenRepository.create({
        id: randomUUID(),
        sessionId: session.id,
        familyId: token.familyId,
        parentTokenId: token.id,
        tokenHash: this.hash(rawReplacement),
        createdAt: now,
        expiresAt: new Date(
          Date.now() + this.refreshSeconds * 1000,
        ).toISOString(),
      });
      token.consumedAt = now;
      token.replacedByTokenId = replacement.id;
      session.lastUsedAt = now;
      await tokenRepository.save([token, replacement]);
      await sessionRepository.save(session);
      return {
        refreshToken: `${replacement.id}.${rawReplacement}`,
        tokenId: replacement.id,
        familyId: token.familyId,
        expiresAt: replacement.expiresAt,
        session,
        reused: false,
      };
    });
  }

  async validateSession(sessionId: string): Promise<AuthSession | null> {
    const session = await this.sessions.findOneBy({ id: sessionId });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date().toISOString()
    )
      return null;
    return session;
  }

  async markMfaVerified(
    sessionId: string,
    ownerUserId: string,
  ): Promise<AuthSession> {
    const session = await this.validateSession(sessionId);
    if (!session || session.userId !== ownerUserId) {
      throw new ForbiddenException('Session cannot be elevated');
    }
    const now = new Date().toISOString();
    session.mfaVerifiedAt = now;
    session.lastUsedAt = now;
    return this.sessions.save(session);
  }

  listUserSessions(userId: string): Promise<AuthSession[]> {
    return this.sessions.find({
      where: {
        userId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date().toISOString()),
      },
      order: { lastUsedAt: 'DESC' },
    });
  }

  async revokeSession(
    sessionId: string,
    reason: string,
    ownerUserId?: string,
  ): Promise<AuthSession> {
    const session = await this.sessions.findOneBy({ id: sessionId });
    if (!session) throw new UnauthorizedException('Authentication required');
    if (ownerUserId && session.userId !== ownerUserId)
      throw new ForbiddenException('Session cannot be revoked');
    if (!session.revokedAt) {
      session.revokedAt = new Date().toISOString();
      session.revocationReason = reason.slice(0, 120);
      await this.sessions.save(session);
      await this.refreshTokens.update(
        { sessionId, revokedAt: IsNull() },
        { revokedAt: session.revokedAt },
      );
    }
    return session;
  }

  async revokeAll(userId: string, reason: string): Promise<string[]> {
    const active = await this.listUserSessions(userId);
    await Promise.all(
      active.map((session) => this.revokeSession(session.id, reason, userId)),
    );
    return active.map((session) => session.id);
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private durationSeconds(value: string): number {
    const match = /^(\d+)(s|m|h|d)$/.exec(value);
    if (!match) throw new Error('Invalid authentication duration');
    const amount = Number(match[1]);
    const unit = match[2] as 's' | 'm' | 'h' | 'd';
    return amount * { s: 1, m: 60, h: 3600, d: 86400 }[unit];
  }
}
