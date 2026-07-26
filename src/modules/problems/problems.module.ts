import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocationEncryptionService } from '../../common/location-encryption.service';
import { Problem } from './entities/problem.entity';
import { ProblemsController } from './problems.controller';
import { ProblemsService } from './problems.service';

@Module({
  imports: [TypeOrmModule.forFeature([Problem])],
  controllers: [ProblemsController],
  providers: [ProblemsService, LocationEncryptionService],
  exports: [ProblemsService],
})
export class ProblemsModule {}
