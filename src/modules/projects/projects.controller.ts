import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../common/auth.decorators';
import { UserRole } from '../../shared';
import {
  CreateProjectMessageDto,
  CreateProjectTaskDto,
  InviteProjectCollaboratorDto,
  RemoveProjectCollaboratorDto,
  RespondProjectInvitationDto,
  SubmitCompletionDto,
  UpdateProjectTaskDto,
  ValidateProjectDto,
} from './dto/project.dto';
import { ProjectMessage } from './entities/project-message.entity';
import { ProjectInvitation } from './entities/project-invitation.entity';
import { ProjectTask } from './entities/project-task.entity';
import { Project } from './entities/project.entity';
import {
  ProjectCollaborationAnalysis,
  ProjectsService,
  ProjectWithParticipants,
  ProjectInvitationView,
} from './projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@Roles(UserRole.REQUESTER, UserRole.SOLVER)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get()
  findMine(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProjectWithParticipants[]> {
    return this.service.findMine(user.userId);
  }

  @Get('invitations/mine')
  findMyInvitations(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProjectInvitationView[]> {
    return this.service.findMyInvitations(user.userId);
  }

  @Patch('invitations/:invitationId/respond')
  respondToInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('invitationId') invitationId: string,
    @Body() dto: RespondProjectInvitationDto,
  ): Promise<ProjectInvitation> {
    return this.service.respondToInvitation(
      user.userId,
      invitationId,
      dto.accepted,
    );
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ProjectWithParticipants> {
    return this.service.findOne(user.userId, id);
  }

  @Delete(':id/collaborators/:collaboratorId')
  removeCollaborator(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('collaboratorId') collaboratorId: string,
    @Body() dto: RemoveProjectCollaboratorDto,
  ): Promise<ProjectWithParticipants> {
    return this.service.removeCollaborator(
      user.userId,
      id,
      collaboratorId,
      dto.reason,
    );
  }

  @Get(':id/collaborators')
  findCollaborators(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('q') query = '',
  ): Promise<ProjectCollaborationAnalysis> {
    return this.service.findCollaborators(user.userId, id, query);
  }

  @Post(':id/collaborators/invite')
  inviteCollaborator(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: InviteProjectCollaboratorDto,
  ): Promise<ProjectInvitation> {
    return this.service.inviteCollaborator(
      user.userId,
      id,
      dto.userId,
      dto.desiredSkills,
      dto.allocationPercent,
    );
  }

  @Post(':id/tasks')
  createTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateProjectTaskDto,
  ): Promise<ProjectTask> {
    return this.service.createTask(user.userId, id, dto);
  }

  @Get(':id/tasks')
  findTasks(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ProjectTask[]> {
    return this.service.findTasks(user.userId, id);
  }

  @Patch(':id/tasks/:taskId')
  updateTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateProjectTaskDto,
  ): Promise<ProjectTask> {
    return this.service.updateTask(user.userId, id, taskId, dto);
  }

  @Post(':id/messages')
  addMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateProjectMessageDto,
  ): Promise<ProjectMessage> {
    return this.service.addMessage(user.userId, id, dto);
  }

  @Get(':id/messages')
  findMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ProjectMessage[]> {
    return this.service.findMessages(user.userId, id);
  }

  @Post(':id/completion')
  submitCompletion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitCompletionDto,
  ): Promise<Project> {
    return this.service.submitCompletion(user.userId, id, dto);
  }

  @Post(':id/validation')
  validate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ValidateProjectDto,
  ): Promise<Project> {
    return this.service.validate(user.userId, id, dto);
  }
}
