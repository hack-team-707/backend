import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ProposalStatus } from '../../../shared';

export class ProposalActivityDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  description!: string;
}

export class ProposalTeamMemberDto {
  @ApiProperty()
  @IsString()
  solverId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  responsibilities!: string[];
}

export class ProposalScheduledDeliverableDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  description!: string;

  @ApiProperty({ example: '2026-08-15' })
  @IsISO8601({ strict: true })
  dueDate!: string;
}

export class GenerateProposalDraftDto {
  @ApiProperty()
  @IsString()
  matchId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  instruction!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  currentDraft?: string;
}

export class SubmitProposalDto {
  @ApiProperty()
  @IsString()
  problemId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  summary!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  scope!: string;

  @ApiProperty({ type: [ProposalActivityDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProposalActivityDto)
  activities!: ProposalActivityDto[];

  @ApiPropertyOptional({ type: [ProposalTeamMemberDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProposalTeamMemberDto)
  teamMembers?: ProposalTeamMemberDto[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  deliverables!: string[];

  @ApiProperty({ type: [ProposalScheduledDeliverableDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProposalScheduledDeliverableDto)
  deliverySchedule!: ProposalScheduledDeliverableDto[];

  @ApiProperty({ example: 'P14D' })
  @IsString()
  @MaxLength(100)
  estimatedDuration!: string;

  @ApiProperty({ minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  conditions!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  acceptanceCriteria!: string[];
}

export class ReviseProposalDto extends OmitType(SubmitProposalDto, [
  'problemId',
  'teamId',
] as const) {}

export class RespondToProposalDto {
  @ApiProperty({
    enum: [
      ProposalStatus.ACCEPTED,
      ProposalStatus.REJECTED,
      ProposalStatus.ADJUSTMENT_REQUESTED,
    ],
  })
  @IsEnum([
    ProposalStatus.ACCEPTED,
    ProposalStatus.REJECTED,
    ProposalStatus.ADJUSTMENT_REQUESTED,
  ])
  status!:
    | ProposalStatus.ACCEPTED
    | ProposalStatus.REJECTED
    | ProposalStatus.ADJUSTMENT_REQUESTED;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  note?: string;

  @ApiPropertyOptional({
    enum: [true],
    description: 'Required when accepting a proposal',
  })
  @ValidateIf(
    (dto: RespondToProposalDto) => dto.status === ProposalStatus.ACCEPTED,
  )
  @IsBoolean()
  @Equals(true)
  confirmed?: true;
}
