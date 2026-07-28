import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  AuthenticatedUser,
  CurrentUser,
  MfaOptional,
  Public,
} from '../common/auth.decorators';
import {
  LoginDto,
  MfaCodeDto,
  MfaVerifyDto,
  RefreshDto,
  RegisterDto,
} from './auth.dto';
import { AuthRequestContext, AuthResponse, AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
  ): Promise<AuthResponse> {
    return this.authService.register(dto, this.context(request));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() request: Request): Promise<AuthResponse> {
    return this.authService.login(dto, this.context(request));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(
    @Body() dto: RefreshDto,
    @Headers('x-csrf-token') csrfToken?: string,
  ): Promise<AuthResponse> {
    return this.authService.refresh(dto.refreshToken, csrfToken);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('mfa/verify')
  verifyMfa(
    @Body() dto: MfaVerifyDto,
    @Req() request: Request,
  ): Promise<AuthResponse> {
    return this.authService.verifyMfa(
      dto.challengeId,
      dto.totpCode,
      this.context(request),
    );
  }

  @MfaOptional()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.authService.logout(user);
  }

  @MfaOptional()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout-all')
  logoutAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.authService.logoutAll(user);
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listSessions(user);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('sessions/:sessionId')
  revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ): Promise<void> {
    return this.authService.revokeSession(user, sessionId);
  }

  @MfaOptional()
  @Get('csrf')
  async csrf(@CurrentUser() user: AuthenticatedUser) {
    return { csrfToken: await this.authService.issueCsrf(user) };
  }

  @MfaOptional()
  @Post('mfa/setup')
  setupMfa(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.startMfaSetup(user);
  }

  @MfaOptional()
  @HttpCode(HttpStatus.OK)
  @Post('mfa/confirm')
  confirmMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MfaCodeDto,
  ): Promise<AuthResponse> {
    return this.authService.confirmMfaSetup(user, dto.totpCode);
  }

  @Post('socket-ticket')
  socketTicket(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ticket: string }> {
    return this.authService.issueSocketTicket(user);
  }

  private context(request: Request): AuthRequestContext {
    const correlation = request.headers['x-correlation-id'];
    const forwarded = request.headers['x-forwarded-for'];
    const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return {
      ipAddress: forwardedValue?.split(',')[0]?.trim() || request.ip,
      userAgent: request.get('user-agent'),
      ...(typeof correlation === 'string'
        ? { correlationId: correlation.slice(0, 120) }
        : {}),
    };
  }
}
