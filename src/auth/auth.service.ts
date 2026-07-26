import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { UserRole } from '../shared';
import {
  PublicUser,
  toPublicUser,
  User,
} from '../modules/users/entities/user.entity';
import { UsersService } from '../modules/users/users.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { AuthenticatedUser } from '../common/auth.decorators';
import { PasswordService } from './password.service';

export interface AuthResponse {
  accessToken: string;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();
    if (await this.usersService.findByEmail(email)) {
      throw new ConflictException('Email is already registered');
    }
    const now = new Date().toISOString();
    const user: User = {
      id: randomUUID(),
      email,
      displayName: dto.displayName.trim(),
      passwordHash: await this.passwordService.hash(dto.password),
      roles: [UserRole.REQUESTER, UserRole.SOLVER],
      createdAt: now,
      updatedAt: now,
    };
    await this.usersService.create(user);
    return this.issueToken(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(
      dto.email.trim().toLowerCase(),
    );
    if (
      !user ||
      !(await this.passwordService.verify(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueToken(user);
  }

  async issueSocketTicket(
    user: AuthenticatedUser,
  ): Promise<{ ticket: string }> {
    const ticket = await this.jwtService.signAsync(
      {
        sub: user.userId,
        email: user.email,
        roles: user.roles,
        purpose: 'socket',
      },
      { expiresIn: '60s' },
    );
    return { ticket };
  }

  private async issueToken(user: User): Promise<AuthResponse> {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      roles: user.roles,
    });
    return { accessToken, user: toPublicUser(user) };
  }
}
