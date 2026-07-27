import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProblemModality } from '../enums/problem-modality.enum';
import { TalentProviderName } from '../enums/talent-provider.enum';

export class ExternalTalentCandidateResponseDto {
  @ApiProperty({ enum: TalentProviderName })
  provider!: TalentProviderName;

  @ApiProperty()
  externalId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  availability!: 'UNKNOWN';

  @ApiProperty()
  compatibilityScore!: number;

  @ApiPropertyOptional()
  profileUrl?: string;
}

export class ExternalTalentResponseDto {
  @ApiProperty()
  problemId!: string;

  @ApiProperty()
  fallbackActivated!: boolean;

  @ApiProperty({ enum: ProblemModality })
  modality!: ProblemModality;

  @ApiProperty({ enum: TalentProviderName, isArray: true })
  providersExecuted!: TalentProviderName[];

  @ApiProperty({ type: [ExternalTalentCandidateResponseDto] })
  results!: ExternalTalentCandidateResponseDto[];
}
