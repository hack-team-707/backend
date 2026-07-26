import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MinLength } from 'class-validator';

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
