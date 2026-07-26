import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { UserRole } from '../../../shared';

export class UpdateUserRolesDto {
  @ApiProperty({ enum: UserRole, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(UserRole, { each: true })
  roles!: UserRole[];

  @ApiProperty({ enum: [true], description: 'Explicit admin confirmation' })
  @IsBoolean()
  @Equals(true)
  confirmed!: true;
}
