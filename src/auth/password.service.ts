import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcrypt';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export interface PasswordVerification {
  valid: boolean;
  needsRehash: boolean;
}

@Injectable()
export class PasswordService {
  private static readonly BCRYPT_ROUNDS = 12;

  hash(password: string): Promise<string> {
    return hash(password, PasswordService.BCRYPT_ROUNDS);
  }

  async verify(password: string, stored: string): Promise<boolean> {
    return (await this.verifyWithMigration(password, stored)).valid;
  }

  async verifyWithMigration(
    password: string,
    stored: string,
  ): Promise<PasswordVerification> {
    if (stored.startsWith('$2a$') || stored.startsWith('$2b$')) {
      return { valid: await compare(password, stored), needsRehash: false };
    }
    const [algorithm, saltHex, hashHex] = stored.split(':');
    if (algorithm !== 'scrypt' || !saltHex || !hashHex)
      return { valid: false, needsRehash: false };
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await this.derive(password, Buffer.from(saltHex, 'hex'));
    const valid =
      expected.length === actual.length && timingSafeEqual(expected, actual);
    return { valid, needsRehash: valid };
  }

  async legacyHash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await this.derive(password, salt);
    return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
  }

  private derive(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      scrypt(password, salt, 64, (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      });
    });
  }
}
