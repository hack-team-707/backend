import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { UsersService } from '../modules/users/users.service';
import { SecurityStoreService } from './security-store.service';

interface MfaChallenge {
  userId: string;
  createdAt: string;
}

@Injectable()
export class MfaService {
  private readonly encryptionKey: Buffer;
  private readonly issuer: string;

  constructor(
    private readonly users: UsersService,
    private readonly store: SecurityStoreService,
    config: ConfigService,
  ) {
    const key =
      config.get<string>('MFA_ENCRYPTION_KEY') ??
      config.getOrThrow<string>('DATA_ENCRYPTION_KEY');
    this.encryptionKey = /^[a-fA-F0-9]{64}$/.test(key)
      ? Buffer.from(key, 'hex')
      : createHmac('sha256', 'resolve-mfa').update(key).digest();
    this.issuer = config.get<string>('JWT_ISSUER', 'resolve-platform');
  }

  async startSetup(userId: string): Promise<{ otpauthUri: string }> {
    const user = await this.users.findById(userId);
    if (!user) throw new ForbiddenException('Authentication required');
    const secret = this.base32Encode(randomBytes(20));
    user.mfaPendingSecretEncrypted = this.encrypt(secret);
    user.updatedAt = new Date().toISOString();
    await this.users.save(user);
    const label = encodeURIComponent(`${this.issuer}:${user.email}`);
    return {
      otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(this.issuer)}&algorithm=SHA1&digits=6&period=30`,
    };
  }

  async confirmSetup(userId: string, code: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user?.mfaPendingSecretEncrypted)
      throw new ForbiddenException('MFA setup is not available');
    const secret = this.decrypt(user.mfaPendingSecretEncrypted);
    const step = this.verifyCode(secret, code);
    if (step === null || user.mfaLastUsedTimeStep === String(step))
      throw new ForbiddenException('Código MFA inválido');
    const now = new Date().toISOString();
    user.mfaSecretEncrypted = this.encrypt(secret);
    user.mfaPendingSecretEncrypted = null;
    user.mfaEnabled = true;
    user.mfaVerifiedAt = now;
    user.mfaLastUsedTimeStep = String(step);
    user.updatedAt = now;
    await this.users.save(user);
  }

  async createChallenge(userId: string): Promise<string> {
    const challengeId = randomUUID();
    await this.store.set(
      `auth:mfa:challenge:${challengeId}`,
      JSON.stringify({ userId, createdAt: new Date().toISOString() }),
      5 * 60,
    );
    return challengeId;
  }

  async verifyChallenge(challengeId: string, code: string): Promise<string> {
    const key = `auth:mfa:challenge:${challengeId}`;
    const raw = await this.store.get(key);
    if (!raw) throw new ForbiddenException('Desafío MFA inválido o vencido');
    const challenge = JSON.parse(raw) as MfaChallenge;
    const user = await this.users.findById(challenge.userId);
    if (!user?.mfaEnabled || !user.mfaSecretEncrypted)
      throw new ForbiddenException('Desafío MFA inválido o vencido');
    const step = this.verifyCode(this.decrypt(user.mfaSecretEncrypted), code);
    if (step === null || user.mfaLastUsedTimeStep === String(step))
      throw new ForbiddenException('Código MFA inválido');
    if (
      !(await this.store.setIfAbsent(
        `auth:mfa:step:${user.id}:${step}`,
        '1',
        90,
      ))
    )
      throw new ForbiddenException('Código MFA ya utilizado');
    await this.store.delete(key);
    user.mfaLastUsedTimeStep = String(step);
    user.mfaVerifiedAt = new Date().toISOString();
    await this.users.save(user);
    return user.id;
  }

  private verifyCode(secret: string, candidate: string): number | null {
    if (!/^\d{6}$/.test(candidate)) return null;
    const current = Math.floor(Date.now() / 30000);
    for (const step of [current - 1, current, current + 1]) {
      const expected = Buffer.from(this.codeAt(secret, step));
      const actual = Buffer.from(candidate);
      if (
        expected.length === actual.length &&
        timingSafeEqual(expected, actual)
      )
        return step;
    }
    return null;
  }

  private codeAt(secret: string, step: number): string {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const digest = createHmac('sha1', this.base32Decode(secret))
      .update(counter)
      .digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
    return value.toString().padStart(6, '0');
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), encrypted]
      .map((item) => item.toString('base64url'))
      .join('.');
  }

  private decrypt(value: string): string {
    const [iv, tag, encrypted] = value
      .split('.')
      .map((item) => Buffer.from(item, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  }

  private base32Encode(value: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const byte of value) bits += byte.toString(2).padStart(8, '0');
    let result = '';
    for (let index = 0; index < bits.length; index += 5) {
      result +=
        alphabet[
          Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)
        ];
    }
    return result;
  }

  private base32Decode(value: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const character of value.replace(/=+$/, '').toUpperCase()) {
      const index = alphabet.indexOf(character);
      if (index < 0) throw new Error('Invalid MFA secret');
      bits += index.toString(2).padStart(5, '0');
    }
    const bytes: number[] = [];
    for (let index = 0; index + 8 <= bits.length; index += 8) {
      bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
    }
    return Buffer.from(bytes);
  }
}
