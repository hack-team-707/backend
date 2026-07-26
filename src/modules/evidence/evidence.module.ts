import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from '../projects/entities/project.entity';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';
import { Evidence } from './entities/evidence.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Evidence, Project])],
  controllers: [EvidenceController],
  providers: [EvidenceService],
  exports: [EvidenceService],
})
export class EvidenceModule {}
