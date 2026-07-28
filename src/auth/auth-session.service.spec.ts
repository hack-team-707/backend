import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { AuthSessionService } from './auth-session.service';
import { AuthSession } from './entities/auth-session.entity';
import { RefreshToken } from './entities/refresh-token.entity';

function repository<T extends object>(
  overrides: Partial<Repository<T>> = {},
): Repository<T> {
  return {
    create: jest.fn((value) => value),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn(async (value) => value),
    update: jest.fn(),
    ...overrides,
  } as unknown as Repository<T>;
}

function serviceWith(
  sessions: Repository<AuthSession>,
  tokens: Repository<RefreshToken>,
  dataSource: Partial<DataSource> = {},
): AuthSessionService {
  const config = {
    get: jest.fn((_name: string, fallback: string) => fallback),
  } as unknown as ConfigService;
  return new AuthSessionService(
    sessions,
    tokens,
    dataSource as DataSource,
    config,
  );
}

describe('AuthSessionService', () => {
  it('revokes the oldest session before creating a sixth active session', async () => {
    const active = Array.from({ length: 5 }, (_, index) => ({
      id: `00000000-0000-4000-8000-00000000000${index}`,
      userId: 'user-1',
      createdAt: `2026-01-0${index + 1}T00:00:00.000Z`,
      lastUsedAt: `2026-01-0${index + 1}T00:00:00.000Z`,
      expiresAt: '2099-01-01T00:00:00.000Z',
    })) as AuthSession[];
    const sessions = repository<AuthSession>({
      find: jest.fn().mockResolvedValue(active),
      findOneBy: jest.fn().mockResolvedValue(active[0]),
    });
    const tokens = repository<RefreshToken>();
    const service = serviceWith(sessions, tokens);

    const result = await service.createSession('user-1', {});

    expect(result.evictedSessionId).toBe(active[0].id);
    expect(active[0].revocationReason).toBe('session_limit_reached');
    expect(tokens.update).toHaveBeenCalled();
  });

  it('revokes a refresh family and session when a consumed token is reused', async () => {
    const token = {
      id: '00000000-0000-4000-8000-000000000010',
      sessionId: '00000000-0000-4000-8000-000000000020',
      familyId: '00000000-0000-4000-8000-000000000030',
      tokenHash: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      consumedAt: '2026-01-01T00:01:00.000Z',
    } as RefreshToken;
    const session = {
      id: token.sessionId,
      userId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastUsedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
    } as AuthSession;
    const tokenRepository = repository<RefreshToken>({
      findOne: jest.fn().mockResolvedValue(token),
    });
    const sessionRepository = repository<AuthSession>({
      findOne: jest.fn().mockResolvedValue(session),
    });
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === RefreshToken ? tokenRepository : sessionRepository,
      ),
    };
    const dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
    } as unknown as DataSource;
    const service = serviceWith(sessionRepository, tokenRepository, dataSource);
    const [, raw] = `${token.id}.secret`.split('.');
    token.tokenHash = (
      service as unknown as { hash(value: string): string }
    ).hash(raw);

    const result = await service.rotate(`${token.id}.${raw}`);

    expect(result.reused).toBe(true);
    expect(session.revocationReason).toBe('refresh_reuse_detected');
    expect(tokenRepository.update).toHaveBeenCalled();
  });

  it('does not allow a user to revoke another user session', async () => {
    const sessions = repository<AuthSession>({
      findOneBy: jest.fn().mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000020',
        userId: 'other-user',
      }),
    });
    const service = serviceWith(sessions, repository<RefreshToken>());

    await expect(
      service.revokeSession(
        '00000000-0000-4000-8000-000000000020',
        'user_revoked',
        'user-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
