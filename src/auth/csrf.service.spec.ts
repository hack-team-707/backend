import { ConfigService } from '@nestjs/config';
import { CsrfService } from './csrf.service';
import { SecurityStoreService } from './security-store.service';

describe('CsrfService', () => {
  const config = {
    get: jest.fn((name: string, fallback?: string) =>
      name === 'JWT_REFRESH_EXPIRES_IN' ? '7d' : fallback,
    ),
  } as unknown as ConfigService;

  it('issues, verifies, rejects and revokes session-bound tokens', async () => {
    const store = new SecurityStoreService(config);
    const service = new CsrfService(store, config);

    const token = await service.issue('session-1');

    await expect(service.verify('session-1', token)).resolves.toBe(true);
    await expect(service.verify('session-2', token)).resolves.toBe(false);
    await expect(service.verify('session-1', 'invalid')).resolves.toBe(false);

    await service.revoke('session-1');
    await expect(service.verify('session-1', token)).resolves.toBe(false);
  });
});
