import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiEngineModule } from '../ai-engine/ai-engine.module';
import { Match } from '../matching/entities/match.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentPlansModule } from '../payment-plans/payment-plans.module';
import { Problem } from '../problems/entities/problem.entity';
import { ProjectsModule } from '../projects/projects.module';
import { Team } from '../team-formation/entities/team.entity';
import { Proposal } from './entities/proposal.entity';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Proposal, Problem, Match, Team]),
    AiEngineModule,
    NotificationsModule,
    PaymentPlansModule,
    ProjectsModule,
  ],
  controllers: [ProposalsController],
  providers: [ProposalsService],
  exports: [ProposalsService],
})
export class ProposalsModule {}
