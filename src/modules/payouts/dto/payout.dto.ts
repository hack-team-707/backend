import { Equals, IsBoolean, IsString, MaxLength } from 'class-validator';

export class ProcessPayoutDto {
  @IsString()
  @MaxLength(500)
  externalReference!: string;

  @IsBoolean()
  @Equals(true)
  confirmed!: true;
}
