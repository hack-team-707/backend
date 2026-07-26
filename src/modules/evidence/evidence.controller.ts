import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../common/auth.decorators';
import { UserRole } from '../../shared';
import { CreateEvidenceDto, ReviewEvidenceDto } from './dto/evidence.dto';
import { Evidence } from './entities/evidence.entity';
import { EvidenceService } from './evidence.service';

@ApiTags('evidence')
@ApiBearerAuth()
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly service: EvidenceService) {}

  @Post('projects/:projectId/progress')
  @Roles(UserRole.SOLVER)
  createProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateEvidenceDto,
  ): Promise<Evidence> {
    return this.service.createProgress(user.userId, projectId, dto);
  }

  @Post('projects/:projectId/completion')
  @Roles(UserRole.SOLVER)
  createCompletionEvidence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateEvidenceDto,
  ): Promise<Evidence> {
    return this.service.createCompletionEvidence(user.userId, projectId, dto);
  }

  @Get('projects/:projectId')
  @Roles(UserRole.REQUESTER, UserRole.SOLVER)
  findForProject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<Evidence[]> {
    return this.service.findForProject(user.userId, projectId);
  }

  @Patch(':id/review')
  @Roles(UserRole.REQUESTER)
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviewEvidenceDto,
  ): Promise<Evidence> {
    return this.service.review(user.userId, id, dto);
  }
}
