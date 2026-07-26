import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from '../admin/admin.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import {
  AdminDisputesController,
  DisputesController,
} from './disputes.controller';
import { DisputesService } from './disputes.service';
import { Dispute } from './entities/dispute.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Dispute, Project, User]),
    AdminModule,
    NotificationsModule,
  ],
  controllers: [DisputesController, AdminDisputesController],
  providers: [DisputesService],
})
export class DisputesModule {}
