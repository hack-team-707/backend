import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsUUID,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

const PASSWORD_MESSAGE =
  'Password must contain at least 10 characters, one uppercase letter, one number, and one special character';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 2, maxLength: 80 })
  @IsString()
  @Length(2, 80)
  displayName!: string;

  @ApiProperty({ minLength: 10, writeOnly: true })
  @IsString()
  @MinLength(10)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/, {
    message: PASSWORD_MESSAGE,
  })
  password!: string;
}

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  password!: string;
}

export class RefreshDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(32)
  refreshToken!: string;
}

export class MfaCodeDto {
  @ApiProperty()
  @IsString()
  @Matches(/^\d{6}$/)
  totpCode!: string;
}

export class MfaVerifyDto extends MfaCodeDto {
  @ApiProperty()
  @IsUUID()
  challengeId!: string;
}
