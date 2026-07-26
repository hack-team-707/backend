import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MatchStatus } from '../../../shared';

export class RequiredSkillDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  skillId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ minimum: 0.01, maximum: 1 })
  @IsNumber()
  @Min(0.01)
  @Max(1)
  weight!: number;
}

export class RankMatchesDto {
  @ApiProperty({ type: [RequiredSkillDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RequiredSkillDto)
  requiredSkills!: RequiredSkillDto[];

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class RespondToMatchDto {
  @ApiProperty({ enum: [MatchStatus.ACCEPTED, MatchStatus.DECLINED] })
  @IsEnum([MatchStatus.ACCEPTED, MatchStatus.DECLINED])
  status!: MatchStatus.ACCEPTED | MatchStatus.DECLINED;
}

export class SearchOpportunitiesQueryDto {
  @ApiProperty({ minLength: 2, maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  q!: string;

  @ApiPropertyOptional({ default: 8, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 8;
}
