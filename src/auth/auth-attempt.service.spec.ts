import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthAttemptService } from './auth-attempt.service';
import { SecurityStoreService } from './security-store.service';

describe('AuthAttemptService', () => {
  it('locks an account after five failures and clears state on success', async () => {
    const config = { get: jest.fn() } as unknown as ConfigService;
    const service = new AuthAttemptService(new SecurityStoreService(config));
    const email = 'Person@Example.com';
    const ip = '203.0.113.10';

    for (
      let attempt = 0;
      attempt < AuthAttemptService.MAX_FAILURES;
      attempt++
    ) {
      await service.recordFailure(email, ip);
    }

    const blocked = await service
      .assertAllowed(email, ip)
      .catch((error: unknown) => error as HttpException);
    expect(blocked).toBeInstanceOf(HttpException);
    if (!(blocked instanceof HttpException)) {
      throw new Error('Expected account lockout');
    }
    expect(blocked.getStatus()).toBe(429);
    await service.recordSuccess(email);
    await expect(service.assertAllowed(email, ip)).resolves.toBeUndefined();
  });

  it('normalizes identifiers without retaining the original value in keys', () => {
    const config = { get: jest.fn() } as unknown as ConfigService;
    const service = new AuthAttemptService(new SecurityStoreService(config));

    expect(service.normalizeEmail(' Person@Example.COM ')).toBe(
      'person@example.com',
    );
    expect(service.hash('person@example.com')).toMatch(/^[a-f0-9]{64}$/);
    expect(service.hash('person@example.com')).not.toContain(
      'person@example.com',
    );
  });
});
