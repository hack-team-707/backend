import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiEngineModule } from '../ai-engine/ai-engine.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Problem } from '../problems/entities/problem.entity';
import { SkillCard } from '../skill-cards/entities/skill-card.entity';
import { Match } from './entities/match.entity';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { OpportunitySearchService } from './opportunity-search.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Match, Problem, SkillCard]),
    AiEngineModule,
    NotificationsModule,
  ],
  controllers: [MatchingController],
  providers: [MatchingService, OpportunitySearchService],
  exports: [MatchingService, OpportunitySearchService],
})
export class MatchingModule {}
