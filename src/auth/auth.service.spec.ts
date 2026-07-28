import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../shared';
import { createMockRepository } from '../test-utils/typeorm-repository.mock';
import { User } from '../modules/users/entities/user.entity';
import { UsersService } from '../modules/users/users.service';
import { AuthAttemptService } from './auth-attempt.service';
import { AuthAuditService } from './auth-audit.service';
import { AuthService } from './auth.service';
import { AuthSessionService } from './auth-session.service';
import { CsrfService } from './csrf.service';
import { MfaService } from './mfa.service';
import { PasswordService } from './password.service';
import { SecurityStoreService } from './security-store.service';
import { SessionDisconnectService } from './session-disconnect.service';
import { TokenRevocationService } from './token-revocation.service';

describe('AuthService', () => {
  const config = new ConfigService({
    AUTH_SESSION_V2_ENABLED: false,
    REFRESH_TOKEN_ENABLED: false,
    CSRF_ENFORCED: false,
    MFA_ENFORCED: false,
    JWT_ISSUER: 'resolve-platform',
    JWT_AUDIENCE: 'resolve-platform-web',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  });
  const users = new UsersService(createMockRepository<User>());
  const store = new SecurityStoreService(config);
  const service = new AuthService(
    users,
    new PasswordService(),
    new JwtService({ secret: 'test-secret-that-is-at-least-32-characters' }),
    config,
    new AuthAttemptService(store),
    { record: jest.fn() } as unknown as AuthAuditService,
    {} as AuthSessionService,
    new CsrfService(store, config),
    {} as MfaService,
    new TokenRevocationService(store),
    new SessionDisconnectService(),
  );

  it('registers a unified account and logs it in', async () => {
    const password = 'Long-test-password1!';
    const registered = await service.register({
      email: 'Person@Example.com',
      displayName: 'Person',
      password,
    });
    expect(registered.user.roles).toEqual([
      UserRole.REQUESTER,
      UserRole.SOLVER,
    ]);
    expect(registered.accessToken).toBeTruthy();
    expect(
      await service.login({
        email: 'person@example.com',
        password,
      }),
    ).toHaveProperty('accessToken');
    expect(
      (await users.findByEmail('person@example.com'))?.passwordHash,
    ).not.toContain(password);
  });
});
