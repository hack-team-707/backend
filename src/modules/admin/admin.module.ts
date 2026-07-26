import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Problem } from '../problems/entities/problem.entity';
import { Project } from '../projects/entities/project.entity';
import { Rating } from '../reputation/entities/rating.entity';
import { User } from '../users/entities/user.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog, User, Problem, Project, Rating]),
  ],
  controllers: [AdminController],
  providers: [AdminService, AuditService],
  exports: [AuditService],
})
export class AdminModule {}
