import { ApiProperty } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsEnum,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DisputeStatus } from '../../../shared';

export class CreateDisputeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  projectId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  reason!: string;

  @ApiProperty({ enum: [true], description: 'Explicit user confirmation' })
  @IsBoolean()
  @Equals(true)
  confirmed!: true;
}

export class ReviewDisputeDto {
  @ApiProperty({ enum: [DisputeStatus.UNDER_REVIEW, DisputeStatus.RESOLVED] })
  @IsEnum([DisputeStatus.UNDER_REVIEW, DisputeStatus.RESOLVED])
  status!: DisputeStatus.UNDER_REVIEW | DisputeStatus.RESOLVED;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  note!: string;

  @ApiProperty({ enum: [true], description: 'Explicit admin confirmation' })
  @IsBoolean()
  @Equals(true)
  confirmed!: true;
}
