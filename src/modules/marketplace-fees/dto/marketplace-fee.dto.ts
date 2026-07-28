import { ApiProperty } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsISO8601,
  IsInt,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateMarketplaceFeeDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ minimum: 0, maximum: 10000 })
  @IsInt()
  @Min(0)
  @Max(10000)
  feeBasisPoints!: number;

  @ApiProperty({ example: '2.5000' })
  @IsString()
  @Matches(/^(0|[1-9]\d*)(?:\.\d{1,4})?$/)
  fixedFeeAmount!: string;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @ApiProperty({ example: '2026-08-15T00:00:00.000Z' })
  @IsISO8601({ strict: true })
  effectiveFrom!: string;

  @ApiProperty({ enum: [true] })
  @IsBoolean()
  @Equals(true)
  confirmed!: true;
}
