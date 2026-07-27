import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../../common/auth.decorators';
import { UserRole } from '../../../shared';
import { ProblemsService } from '../../problems/problems.service';
import { SearchExternalTalentDto } from '../dto/search-external-talent.dto';
import { ExternalTalentService } from '../services/external-talent.service';

@ApiTags('external-talent')
@ApiBearerAuth()
@Controller('external-talent')
@Roles(UserRole.REQUESTER)
export class ExternalTalentController {
  constructor(
    private readonly service: ExternalTalentService,
    private readonly problems: ProblemsService,
  ) {}

  @Post('search')
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SearchExternalTalentDto,
  ) {
    await this.problems.findOne(user.userId, dto.problemId);
    return this.service.search(user.userId, dto);
  }

  @Get('searches/problem/:problemId')
  findForProblem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('problemId') problemId: string,
  ) {
    return this.service.findForProblem(user.userId, problemId);
  }

  @Get('searches/:id')
  findSearch(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findSearch(user.userId, id);
  }

  @Get('providers/health')
  health() {
    return this.service.providerHealth();
  }
}
