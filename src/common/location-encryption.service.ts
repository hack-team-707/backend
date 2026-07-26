import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { GeoCoordinates } from '../shared';

@Injectable()
export class LocationEncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = Buffer.from(
      config.getOrThrow<string>('DATA_ENCRYPTION_KEY'),
      'hex',
    );
  }

  encrypt(coordinates: GeoCoordinates): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(coordinates), 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(payload: string): GeoCoordinates {
    const [version, encodedIv, encodedTag, encodedCiphertext] =
      payload.split('.');
    if (version !== 'v1' || !encodedIv || !encodedTag || !encodedCiphertext) {
      throw new Error('Invalid encrypted location payload');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(encodedIv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext) as GeoCoordinates;
  }
}
