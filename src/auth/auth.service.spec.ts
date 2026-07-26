import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../shared';
import { createMockRepository } from '../test-utils/typeorm-repository.mock';
import { User } from '../modules/users/entities/user.entity';
import { UsersService } from '../modules/users/users.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

describe('AuthService', () => {
  const users = new UsersService(createMockRepository<User>());
  const service = new AuthService(
    users,
    new PasswordService(),
    new JwtService({ secret: 'test-secret-that-is-at-least-32-characters' }),
  );

  it('registers a unified account and logs it in', async () => {
    const registered = await service.register({
      email: 'Person@Example.com',
      displayName: 'Person',
      password: 'long-test-password',
    });
    expect(registered.user.roles).toEqual([
      UserRole.REQUESTER,
      UserRole.SOLVER,
    ]);
    expect(registered.accessToken).toBeTruthy();
    expect(
      await service.login({
        email: 'person@example.com',
        password: 'long-test-password',
      }),
    ).toHaveProperty('accessToken');
    expect(
      (await users.findByEmail('person@example.com'))?.passwordHash,
    ).not.toContain('long-test-password');
  });
});
