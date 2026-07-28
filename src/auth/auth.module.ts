import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from '../modules/admin/admin.module';
import { UsersModule } from '../modules/users/users.module';
import { AuthAttemptService } from './auth-attempt.service';
import { AuthAuditService } from './auth-audit.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthSessionService } from './auth-session.service';
import { CsrfService } from './csrf.service';
import { AuthSession } from './entities/auth-session.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { JwtStrategy } from './jwt.strategy';
import { MfaService } from './mfa.service';
import { PasswordService } from './password.service';
import { SecurityStoreService } from './security-store.service';
import { SessionDisconnectService } from './session-disconnect.service';
import { TokenRevocationService } from './token-revocation.service';

@Module({
  imports: [
    UsersModule,
    AdminModule,
    TypeOrmModule.forFeature([AuthSession, RefreshToken]),
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    JwtStrategy,
    SecurityStoreService,
    AuthAttemptService,
    AuthAuditService,
    AuthSessionService,
    CsrfService,
    MfaService,
    SessionDisconnectService,
    TokenRevocationService,
  ],
  exports: [
    AuthService,
    JwtModule,
    AuthSessionService,
    SecurityStoreService,
    SessionDisconnectService,
    TokenRevocationService,
    CsrfService,
  ],
})
export class AuthModule {}
