import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await this.derive(password, salt);
    return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [algorithm, saltHex, hashHex] = stored.split(':');
    if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await this.derive(password, Buffer.from(saltHex, 'hex'));
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
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
