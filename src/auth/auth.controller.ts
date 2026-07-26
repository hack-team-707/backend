import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  Public,
} from '../common/auth.decorators';
import { AuthResponse, AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(dto);
  }

  @Post('socket-ticket')
  socketTicket(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ticket: string }> {
    return this.authService.issueSocketTicket(user);
  }
}
