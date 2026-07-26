import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../common/auth.decorators';
import { UserRole } from '../../shared';
import { ConfirmTeamDto } from './dto/team-formation.dto';
import { Team } from './entities/team.entity';
import { TeamFormationService } from './team-formation.service';

@ApiTags('team-formation')
@ApiBearerAuth()
@Controller('team-formation')
export class TeamFormationController {
  constructor(private readonly service: TeamFormationService) {}

  @Post('problems/:problemId')
  @Roles(UserRole.REQUESTER)
  form(
    @CurrentUser() user: AuthenticatedUser,
    @Param('problemId') problemId: string,
  ): Promise<Team> {
    return this.service.form(user.userId, problemId);
  }

  @Get(':id')
  @Roles(UserRole.REQUESTER, UserRole.SOLVER)
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Team> {
    return this.service.findOne(user.userId, id);
  }

  @Patch(':id/confirm')
  @Roles(UserRole.REQUESTER)
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ConfirmTeamDto,
  ): Promise<Team> {
    return this.service.confirm(user.userId, id, dto.confirmed);
  }
}
