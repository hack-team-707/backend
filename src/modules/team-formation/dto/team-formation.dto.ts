import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean } from 'class-validator';

export class ConfirmTeamDto {
  @ApiProperty({ enum: [true], description: 'Explicit user confirmation' })
  @IsBoolean()
  @Equals(true)
  confirmed!: true;
}
