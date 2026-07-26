import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import { Rating } from './entities/rating.entity';
import { ReputationController } from './reputation.controller';
import { ReputationService } from './reputation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Rating, Project, User]),
    NotificationsModule,
  ],
  controllers: [ReputationController],
  providers: [ReputationService],
  exports: [ReputationService],
})
export class ReputationModule {}
