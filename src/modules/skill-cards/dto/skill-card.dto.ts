import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUrl,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProficiencyLevel } from '../../../shared';

export class CapabilityAssessmentDto {
  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  score!: number;

  @ApiProperty({ enum: ProficiencyLevel })
  @IsEnum(ProficiencyLevel)
  suggestedLevel!: ProficiencyLevel;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  strengths!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  improvementAreas!: string[];

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  summary!: string;

  @ApiProperty({ enum: ['ai_assessed'] })
  @Equals('ai_assessed')
  validationStatus!: 'ai_assessed';
}

export class CreateSkillCardDto {
  @ApiProperty({ enum: ProficiencyLevel })
  @IsEnum(ProficiencyLevel)
  proficiencyLevel!: ProficiencyLevel;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  tags!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_tld: false,
    },
    { each: true },
  )
  evidenceLinks!: string[];

  @ApiPropertyOptional({ type: CapabilityAssessmentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CapabilityAssessmentDto)
  assessment?: CapabilityAssessmentDto;

  @ApiProperty({ enum: [true], description: 'Explicit user confirmation' })
  @IsBoolean()
  @Equals(true)
  confirmed!: true;
}

export class UpdateSkillCardDto extends PartialType(CreateSkillCardDto) {}
