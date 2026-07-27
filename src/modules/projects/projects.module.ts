import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiEngineModule } from '../ai-engine/ai-engine.module';
import { Evidence } from '../evidence/entities/evidence.entity';
import { Problem } from '../problems/entities/problem.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { SkillCardsModule } from '../skill-cards/skill-cards.module';
import { UsersModule } from '../users/users.module';
import { ProjectActivity } from './entities/project-activity.entity';
import { ProjectChannelMember } from './entities/project-channel-member.entity';
import { ProjectChannel } from './entities/project-channel.entity';
import { ProjectFile } from './entities/project-file.entity';
import { ProjectLink } from './entities/project-link.entity';
import { ProjectMeeting } from './entities/project-meeting.entity';
import { ProjectMessage } from './entities/project-message.entity';
import { ProjectInvitation } from './entities/project-invitation.entity';
import { ProjectTask } from './entities/project-task.entity';
import { Project } from './entities/project.entity';
import { ProjectRoomController } from './project-room.controller';
import { ProjectRoomService } from './project-room.service';
import {
  LocalProjectStorageProvider,
  PROJECT_STORAGE,
} from './project-storage.provider';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [
    NotificationsModule,
    AiEngineModule,
    SkillCardsModule,
    UsersModule,
    TypeOrmModule.forFeature([
      Project,
      ProjectTask,
      ProjectMessage,
      ProjectInvitation,
      ProjectChannel,
      ProjectChannelMember,
      ProjectFile,
      ProjectLink,
      ProjectMeeting,
      ProjectActivity,
      Problem,
      Evidence,
    ]),
  ],
  controllers: [ProjectsController, ProjectRoomController],
  providers: [
    ProjectsService,
    ProjectRoomService,
    LocalProjectStorageProvider,
    {
      provide: PROJECT_STORAGE,
      useExisting: LocalProjectStorageProvider,
    },
  ],
  exports: [ProjectsService, ProjectRoomService],
})
export class ProjectsModule {}
