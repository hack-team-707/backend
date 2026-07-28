import { Transform } from 'class-transformer';
import { IsBoolean, IsString, IsUUID, Length } from 'class-validator';

export class CreateCheckoutDto {
  @IsUUID()
  installmentId!: string;

  @IsBoolean()
  confirmed!: boolean;
}

export class CreateRefundDto {
  @IsBoolean()
  confirmed!: boolean;

  @IsString()
  @Length(3, 500)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  reason!: string;
}

export interface MercadoPagoWebhookBody {
  type?: unknown;
  action?: unknown;
  data?: { id?: unknown };
}
