import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ConversationActionType,
  ConversationType,
} from '../entities/conversation.entity';

export class CreateConversationDto {
  @ApiProperty({ enum: ConversationType })
  @IsEnum(ConversationType)
  type!: ConversationType;
}

export class StructuredCardDto {
  @ApiProperty({ enum: ConversationActionType })
  @IsEnum(ConversationActionType)
  actionType!: ConversationActionType;

  @ApiProperty({ type: Object })
  @IsObject()
  payload!: Record<string, unknown>;
}

export class MessageLocationDto {
  @ApiProperty({ minimum: -90, maximum: 90 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ minimum: -180, maximum: 180 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  approximateArea!: string;

  @ApiProperty({ enum: ['approximate_public_area'] })
  @Equals('approximate_public_area')
  privacy!: 'approximate_public_area';
}

export class CreateMessageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  text?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  mediaUrls?: string[];

  @ApiPropertyOptional({ type: StructuredCardDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StructuredCardDto)
  structuredCard?: StructuredCardDto;

  @ApiPropertyOptional({ type: MessageLocationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MessageLocationDto)
  location?: MessageLocationDto;
}

export class CreateGuestConversationDto {
  @ApiProperty({
    minLength: 20,
    maxLength: 2000,
    example:
      'Necesito reparar el sistema de inventario porque descuenta productos duplicados.',
  })
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  message!: string;
}

export class ClaimGuestConversationDto {
  @ApiProperty({ description: 'Signed guest conversation ownership token' })
  @IsString()
  @MinLength(20)
  guestToken!: string;
}
