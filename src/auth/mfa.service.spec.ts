import { ConfigService } from '@nestjs/config';
import { UserRole } from '../shared';
import { createMockRepository } from '../test-utils/typeorm-repository.mock';
import { User } from '../modules/users/entities/user.entity';
import { UsersService } from '../modules/users/users.service';
import { MfaService } from './mfa.service';
import { SecurityStoreService } from './security-store.service';

describe('MfaService', () => {
  it('encrypts enrollment secrets and consumes a login challenge once', async () => {
    const config = new ConfigService({
      DATA_ENCRYPTION_KEY:
        '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
      JWT_ISSUER: 'resolve-platform',
    });
    const users = new UsersService(createMockRepository<User>());
    const now = new Date().toISOString();
    const user: User = {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'person@example.com',
      displayName: 'Person',
      passwordHash: 'unused',
      passwordAlgorithm: 'scrypt',
      mfaEnabled: false,
      roles: [UserRole.REQUESTER],
      createdAt: now,
      updatedAt: now,
    };
    await users.create(user);
    const store = new SecurityStoreService(config);
    const service = new MfaService(users, store, config);

    const setup = await service.startSetup(user.id);
    const secret = new URL(setup.otpauthUri).searchParams.get('secret');
    expect(secret).toBeTruthy();
    expect(user.mfaPendingSecretEncrypted).not.toContain(secret as string);

    const codeAt = (
      service as unknown as { codeAt(value: string, step: number): string }
    ).codeAt.bind(service);
    const currentStep = Math.floor(Date.now() / 30000);
    await service.confirmSetup(user.id, codeAt(secret as string, currentStep));

    expect(user.mfaEnabled).toBe(true);
    expect(user.mfaSecretEncrypted).toBeTruthy();
    expect(user.mfaSecretEncrypted).not.toContain(secret as string);
    expect(user.mfaPendingSecretEncrypted).toBeNull();

    user.mfaLastUsedTimeStep = null;
    const challengeId = await service.createChallenge(user.id);
    await expect(
      service.verifyChallenge(
        challengeId,
        codeAt(secret as string, Math.floor(Date.now() / 30000)),
      ),
    ).resolves.toBe(user.id);
    await expect(
      service.verifyChallenge(challengeId, '000000'),
    ).rejects.toThrow('Desafío MFA inválido o vencido');
  });
});
