import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PushSubscriptionKeysDto {
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  p256dh!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(256)
  auth!: string;
}

export class SavePushSubscriptionDto {
  @IsUrl(
    { require_protocol: true },
    { message: 'endpoint must be a valid URL' },
  )
  @MaxLength(2048)
  endpoint!: string;

  @IsOptional()
  @IsNumber()
  expirationTime?: number | null;

  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}

export class RemovePushSubscriptionDto {
  @IsUrl(
    { require_protocol: true },
    { message: 'endpoint must be a valid URL' },
  )
  @MaxLength(2048)
  endpoint!: string;
}
