import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocationEncryptionService } from '../../common/location-encryption.service';
import { Match } from '../matching/entities/match.entity';
import { NoMatchResolution } from '../matching/entities/no-match-resolution.entity';
import { User } from '../users/entities/user.entity';
import { Problem } from './entities/problem.entity';
import { ProblemsController } from './problems.controller';
import { ProblemsService } from './problems.service';
import { PublicProblemsService } from './public-problems.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Problem, Match, NoMatchResolution, User]),
  ],
  controllers: [ProblemsController],
  providers: [
    ProblemsService,
    PublicProblemsService,
    LocationEncryptionService,
  ],
  exports: [ProblemsService],
})
export class ProblemsModule {}
