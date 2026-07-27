import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Match } from '../matching/entities/match.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { Problem } from '../problems/entities/problem.entity';
import { UsersModule } from '../users/users.module';
import { Team } from './entities/team.entity';
import { TeamFormationController } from './team-formation.controller';
import { TeamFormationService } from './team-formation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Team, Match, Problem]),
    UsersModule,
    NotificationsModule,
  ],
  controllers: [TeamFormationController],
  providers: [TeamFormationService],
  exports: [TeamFormationService],
})
export class TeamFormationModule {}
