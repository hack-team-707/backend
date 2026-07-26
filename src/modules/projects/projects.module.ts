import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiEngineModule } from '../ai-engine/ai-engine.module';
import { Evidence } from '../evidence/entities/evidence.entity';
import { Problem } from '../problems/entities/problem.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { SkillCardsModule } from '../skill-cards/skill-cards.module';
import { UsersModule } from '../users/users.module';
import { ProjectMessage } from './entities/project-message.entity';
import { ProjectInvitation } from './entities/project-invitation.entity';
import { ProjectTask } from './entities/project-task.entity';
import { Project } from './entities/project.entity';
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
      Problem,
      Evidence,
    ]),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
