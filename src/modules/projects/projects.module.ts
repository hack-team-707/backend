import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Evidence } from '../evidence/entities/evidence.entity';
import { Problem } from '../problems/entities/problem.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectMessage } from './entities/project-message.entity';
import { ProjectTask } from './entities/project-task.entity';
import { Project } from './entities/project.entity';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [
    NotificationsModule,
    TypeOrmModule.forFeature([
      Project,
      ProjectTask,
      ProjectMessage,
      Problem,
      Evidence,
    ]),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
