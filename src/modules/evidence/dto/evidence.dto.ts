import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';
import { EvidenceStatus } from '../../../shared';

export class CreateEvidenceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  description!: string;

  @ApiPropertyOptional({ description: 'Existing object/file reference URL' })
  @IsOptional()
  @IsUrl()
  referenceUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  mimeType?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sizeBytes?: number;
}

export class ReviewEvidenceDto {
  @ApiProperty({ enum: [EvidenceStatus.ACCEPTED, EvidenceStatus.REJECTED] })
  @IsEnum([EvidenceStatus.ACCEPTED, EvidenceStatus.REJECTED])
  status!: EvidenceStatus.ACCEPTED | EvidenceStatus.REJECTED;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  note?: string;
}
