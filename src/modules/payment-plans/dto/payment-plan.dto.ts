import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PaymentPlanInstallmentDto {
  @ApiProperty({ minimum: 1, maximum: 10000 })
  @IsInt()
  @Min(1)
  @Max(10000)
  allocationBasisPoints!: number;

  @ApiProperty()
  @IsISO8601({ strict: true })
  dueAt!: string;

  @ApiProperty({ maxLength: 240 })
  @IsString()
  @MaxLength(240)
  description!: string;
}

export class PaymentPlanShareDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty({ minimum: 1, maximum: 10000 })
  @IsInt()
  @Min(1)
  @Max(10000)
  shareBasisPoints!: number;
}

export class CreatePaymentPlanDto {
  @ApiProperty({ type: [PaymentPlanInstallmentDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentPlanInstallmentDto)
  installments!: PaymentPlanInstallmentDto[];

  @ApiProperty({ type: [PaymentPlanShareDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentPlanShareDto)
  shares!: PaymentPlanShareDto[];

  @ApiProperty({ enum: [true] })
  @IsBoolean()
  @Equals(true)
  confirmed!: true;
}

export enum PaymentPlanShareDecision {
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

export class AcceptPaymentPlanShareDto {
  @ApiProperty({ enum: PaymentPlanShareDecision })
  @IsEnum(PaymentPlanShareDecision)
  decision!: PaymentPlanShareDecision;

  @ApiProperty({ enum: [true] })
  @IsBoolean()
  @Equals(true)
  confirmed!: true;
}
