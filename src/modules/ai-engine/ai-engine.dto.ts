import { IsString, MaxLength, MinLength } from 'class-validator';

export class AnalyzeProblemDto {
  @IsString()
  @MinLength(3)
  @MaxLength(10_000)
  description!: string;
}
