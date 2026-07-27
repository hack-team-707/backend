import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  ProjectChannelType,
  ProjectFileCategory,
  ProjectFileVisibility,
  ProjectLinkType,
  ProjectMeetingStatus,
  ProjectMeetingType,
} from '../../../shared';

export class CreateProjectChannelDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: [ProjectChannelType.CUSTOM] })
  @IsEnum(ProjectChannelType)
  type: ProjectChannelType = ProjectChannelType.CUSTOM;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  memberIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  clientIncluded?: boolean;
}

export class UpdateProjectChannelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  memberIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  clientIncluded?: boolean;
}

export class CreateChannelMessageDto {
  @ApiPropertyOptional()
  @ValidateIf((dto: CreateChannelMessageDto) => !dto.fileIds?.length)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentMessageId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  mentionUserIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  fileIds?: string[];
}

export class UpdateChannelMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;
}

export class ReactToMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  reaction!: string;
}

export class CreateProjectFileDto {
  @ApiProperty({ enum: ProjectFileCategory })
  @IsEnum(ProjectFileCategory)
  category!: ProjectFileCategory;

  @ApiProperty({ enum: ProjectFileVisibility })
  @IsEnum(ProjectFileVisibility)
  visibility!: ProjectFileVisibility;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  conversationId?: string;
}

export class UpdateProjectFileVisibilityDto {
  @ApiProperty({ enum: ProjectFileVisibility })
  @IsEnum(ProjectFileVisibility)
  visibility!: ProjectFileVisibility;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  conversationId?: string;
}

export class CreateProjectLinkDto {
  @ApiProperty({ enum: ProjectLinkType })
  @IsEnum(ProjectLinkType)
  type!: ProjectLinkType;

  @ApiProperty()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  url!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  repositoryName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  defaultBranch?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  modulePath?: string;

  @ApiProperty({ enum: ProjectFileVisibility })
  @IsEnum(ProjectFileVisibility)
  visibility!: ProjectFileVisibility;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  conversationId?: string;
}

export class CreateProjectMeetingDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: ProjectMeetingType })
  @IsEnum(ProjectMeetingType)
  type!: ProjectMeetingType;

  @ApiProperty()
  @IsISO8601()
  startAt!: string;

  @ApiProperty()
  @IsISO8601()
  endAt!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(80)
  timezone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  meetingUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10080)
  reminderMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  participantIds!: string[];

  @ApiProperty({ enum: ProjectFileVisibility })
  @IsEnum(ProjectFileVisibility)
  visibility!: ProjectFileVisibility;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  conversationId?: string;
}

export class UpdateProjectMeetingDto extends PartialType(
  CreateProjectMeetingDto,
) {
  @ApiPropertyOptional({ enum: ProjectMeetingStatus })
  @IsOptional()
  @IsEnum(ProjectMeetingStatus)
  status?: ProjectMeetingStatus;
}
