import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiEngineModule } from '../ai-engine/ai-engine.module';
import { ProblemsModule } from '../problems/problems.module';
import { ExternalTalentController } from './controllers/external-talent.controller';
import { ExternalTalentResult } from './entities/external-talent-result.entity';
import { ExternalTalentSearch } from './entities/external-talent-search.entity';
import { EXTERNAL_TALENT_PROVIDERS } from './external-talent.constants';
import { FreelancerTalentMapper } from './mappers/freelancer-talent.mapper';
import { GooglePlacesMapper } from './mappers/google-places.mapper';
import { FreelancerTalentProvider } from './providers/freelancer-talent.provider';
import { GooglePlacesProvider } from './providers/google-places.provider';
import { ExternalTalentQueryBuilderService } from './services/external-talent-query-builder.service';
import { ExternalTalentRankingService } from './services/external-talent-ranking.service';
import { ExternalTalentService } from './services/external-talent.service';

@Module({
  imports: [
    HttpModule,
    AiEngineModule,
    ProblemsModule,
    TypeOrmModule.forFeature([ExternalTalentSearch, ExternalTalentResult]),
  ],
  controllers: [ExternalTalentController],
  providers: [
    ExternalTalentService,
    ExternalTalentRankingService,
    ExternalTalentQueryBuilderService,
    FreelancerTalentMapper,
    GooglePlacesMapper,
    FreelancerTalentProvider,
    GooglePlacesProvider,
    {
      provide: EXTERNAL_TALENT_PROVIDERS,
      useFactory: (
        freelancer: FreelancerTalentProvider,
        googlePlaces: GooglePlacesProvider,
      ) => [freelancer, googlePlaces],
      inject: [FreelancerTalentProvider, GooglePlacesProvider],
    },
  ],
  exports: [ExternalTalentService],
})
export class ExternalTalentModule {}
