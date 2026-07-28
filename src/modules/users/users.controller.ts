import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  MfaOptional,
  Roles,
} from '../../common/auth.decorators';
import { UserRole } from '../../shared';
import { PublicUser } from './entities/user.entity';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @MfaOptional()
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<PublicUser> {
    return this.usersService.getPublicById(user.userId);
  }

  @Get(':id')
  @Roles(UserRole.REQUESTER, UserRole.SOLVER)
  findPublic(@Param('id') id: string): Promise<PublicUser> {
    return this.usersService.getPublicById(id);
  }
}
