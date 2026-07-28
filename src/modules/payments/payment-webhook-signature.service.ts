import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

@Injectable()
export class PaymentWebhookSignatureService {
  constructor(private readonly config: ConfigService) {}

  verify(
    signatureHeader: string | undefined,
    requestId: string | undefined,
    dataId: string,
  ): void {
    if (!signatureHeader || !requestId || !dataId)
      throw new BadRequestException('Invalid payment webhook signature');
    const parts = new Map(
      signatureHeader.split(',').map((part) => {
        const separator = part.indexOf('=');
        return [
          part.slice(0, separator).trim(),
          part.slice(separator + 1).trim(),
        ];
      }),
    );
    const timestamp = parts.get('ts');
    const provided = parts.get('v1');
    if (!timestamp || !provided || !/^\d+$/.test(timestamp))
      throw new BadRequestException('Invalid payment webhook signature');
    const timestampMs = BigInt(timestamp) * 1000n;
    const nowMs = BigInt(Date.now());
    const toleranceMs =
      BigInt(
        this.config.getOrThrow<number>(
          'MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS',
        ),
      ) * 1000n;
    const difference =
      nowMs >= timestampMs ? nowMs - timestampMs : timestampMs - nowMs;
    if (difference > toleranceMs)
      throw new BadRequestException('Expired payment webhook signature');
    const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
    const expected = createHmac(
      'sha256',
      this.config.getOrThrow<string>('MERCADO_PAGO_WEBHOOK_SECRET'),
    )
      .update(manifest)
      .digest();
    let actual: Buffer;
    try {
      actual = Buffer.from(provided, 'hex');
    } catch {
      throw new BadRequestException('Invalid payment webhook signature');
    }
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new BadRequestException('Invalid payment webhook signature');
  }
}
