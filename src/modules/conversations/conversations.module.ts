import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../../auth/auth.module';
import { LocationEncryptionService } from '../../common/location-encryption.service';
import { AiEngineModule } from '../ai-engine/ai-engine.module';
import { CapabilityPortfoliosModule } from '../capability-portfolios/capability-portfolios.module';
import { ExternalTalentModule } from '../external-talent/external-talent.module';
import { MatchingModule } from '../matching/matching.module';
import { ProblemsModule } from '../problems/problems.module';
import { SkillCardsModule } from '../skill-cards/skill-cards.module';
import { TeamFormationModule } from '../team-formation/team-formation.module';
import { ConversationsController } from './conversations.controller';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message]),
    AuthModule,
    AiEngineModule,
    CapabilityPortfoliosModule,
    ExternalTalentModule,
    MatchingModule,
    ProblemsModule,
    SkillCardsModule,
    TeamFormationModule,
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService, LocationEncryptionService],
})
export class ConversationsModule {}
