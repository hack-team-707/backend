import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  Max,
  Min,
  IsNumber,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ProjectTaskStatus } from '../../../shared';

export class CreateProjectTaskDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty()
  @IsString()
  assigneeId!: string;
}

export class UpdateProjectTaskDto extends PartialType(CreateProjectTaskDto) {
  @ApiPropertyOptional({ enum: ProjectTaskStatus })
  @IsOptional()
  @IsEnum(ProjectTaskStatus)
  status?: ProjectTaskStatus;
}

export class CreateProjectMessageDto {
  @ApiPropertyOptional()
  @ValidateIf((dto: CreateProjectMessageDto) => !dto.attachmentUrls?.length)
  @IsString()
  @MaxLength(5000)
  text?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  attachmentUrls?: string[];
}

export class SubmitCompletionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  note!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  evidenceIds?: string[];
}

export enum ProjectValidationDecision {
  ACCEPT = 'accept',
  ADDITIONAL_WORK = 'additional_work',
}

export class ValidateProjectDto {
  @ApiProperty({ enum: ProjectValidationDecision })
  @IsEnum(ProjectValidationDecision)
  decision!: ProjectValidationDecision;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  note!: string;

  @ApiProperty({ enum: [true], description: 'Explicit user confirmation' })
  @IsBoolean()
  @Equals(true)
  confirmed!: true;
}

export class InviteProjectCollaboratorDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  desiredSkills?: string[];

  @ApiProperty({
    minimum: 1,
    maximum: 99,
    description: 'Percentage of the total project price offered to the invitee',
  })
  @IsNumber()
  @Min(1)
  @Max(99)
  allocationPercent!: number;
}

export class RespondProjectInvitationDto {
  @ApiProperty()
  @IsBoolean()
  accepted!: boolean;

  @ApiProperty({ enum: [true], description: 'Explicit user confirmation' })
  @IsBoolean()
  @Equals(true)
  confirmed!: true;
}

export class RemoveProjectCollaboratorDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(2000)
  reason!: string;

  @ApiProperty({ enum: [true], description: 'Explicit leader confirmation' })
  @IsBoolean()
  @Equals(true)
  confirmed!: true;
}
