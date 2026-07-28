import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WithdrawalStatus } from '../../../shared';

export class CreateWithdrawalDto {
  @ApiProperty({ description: 'Amount to withdraw' })
  @IsString()
  @IsNotEmpty()
  amount!: string;

  @ApiProperty({ description: 'Currency code', example: 'USD' })
  @IsString()
  @MaxLength(3)
  currency!: string;

  @ApiProperty({ description: 'Destination type', example: 'bank_account' })
  @IsString()
  @MaxLength(80)
  destinationType!: string;

  @ApiProperty({
    description: 'Destination reference (e.g., IBAN, account number)',
  })
  @IsString()
  @MaxLength(500)
  destinationReference!: string;
}

export class ReviewWithdrawalDto {
  @ApiProperty({
    description: 'Approval decision',
    enum: ['approved', 'rejected'],
  })
  @IsString()
  @IsNotEmpty()
  decision!: 'approved' | 'rejected';

  @ApiProperty({ description: 'Reason for rejection', required: false })
  @IsString()
  @MaxLength(1000)
  failureReason?: string;
}

export class MarkWithdrawalPaidDto {
  @ApiProperty({ description: 'External transaction reference' })
  @IsString()
  @MaxLength(500)
  externalReference!: string;
}

export class WithdrawalDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  walletId!: string;

  @ApiProperty()
  amount!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ enum: WithdrawalStatus })
  status!: WithdrawalStatus;

  @ApiProperty()
  destinationType!: string;

  @ApiProperty()
  destinationReference!: string;

  @ApiProperty({ required: false })
  failureReason?: string | null;

  @ApiProperty()
  requestedAt!: Date;

  @ApiProperty({ required: false })
  reviewedAt?: Date | null;

  @ApiProperty({ required: false })
  processedAt?: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class WithdrawalListQuery {
  @ApiProperty({ required: false, default: 50 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 50;

  @ApiProperty({ required: false, default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number = 0;

  @ApiProperty({ required: false, enum: WithdrawalStatus })
  @IsString()
  status?: WithdrawalStatus;
}
