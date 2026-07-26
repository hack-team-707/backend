import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
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
  SubmitCompletionDto,
  UpdateProjectTaskDto,
  ValidateProjectDto,
} from './dto/project.dto';
import { ProjectMessage } from './entities/project-message.entity';
import { ProjectTask } from './entities/project-task.entity';
import { Project } from './entities/project.entity';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@Roles(UserRole.REQUESTER, UserRole.SOLVER)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get()
  findMine(@CurrentUser() user: AuthenticatedUser): Promise<Project[]> {
    return this.service.findMine(user.userId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Project> {
    return this.service.findOne(user.userId, id);
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
