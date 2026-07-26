import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { DisputeStatus, UserRole } from '../../shared';
import { AuditService } from '../admin/audit.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import { CreateDisputeDto, ReviewDisputeDto } from './dto/dispute.dto';
import { Dispute } from './entities/dispute.entity';

@Injectable()
export class DisputesService {
  constructor(
    @InjectRepository(Dispute)
    private readonly disputes: Repository<Dispute>,
    @InjectRepository(Project)
    private readonly projects: Repository<Project>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateDisputeDto): Promise<Dispute> {
    const project = await this.projects.findOneBy({ id: dto.projectId });
    if (!project) throw new NotFoundException('Project not found');
    if (!project.participantIds.includes(userId))
      throw new ForbiddenException('User is not a project participant');
    const existing = await this.disputes.find({
      where: { projectId: dto.projectId },
    });
    if (
      existing.some((dispute) =>
        [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW].includes(
          dispute.status,
        ),
      )
    )
      throw new ConflictException('Project already has an active dispute');
    const now = new Date().toISOString();
    const dispute = await this.disputes.save(
      this.disputes.create({
        id: randomUUID(),
        projectId: project.id,
        openedBy: userId,
        participantIds: [...project.participantIds],
        reason: dto.reason.trim(),
        status: DisputeStatus.OPEN,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const admins = (await this.users.find()).filter((user) =>
      user.roles.includes(UserRole.ADMIN),
    );
    await Promise.allSettled(
      admins.map((admin) =>
        this.notifications.create({
          userId: admin.id,
          type: NotificationType.DISPUTE_OPENED,
          title: 'New dispute opened',
          message: `A dispute was opened for project ${project.title}.`,
          href: `/admin/disputes/${dispute.id}`,
        }),
      ),
    );
    return dispute;
  }

  async findMine(userId: string): Promise<Dispute[]> {
    const disputes = await this.disputes.find({
      order: { updatedAt: 'DESC' },
    });
    return disputes.filter((dispute) =>
      dispute.participantIds.includes(userId),
    );
  }

  findAll(): Promise<Dispute[]> {
    return this.disputes.find({ order: { updatedAt: 'DESC' } });
  }

  async review(
    actorId: string,
    id: string,
    dto: ReviewDisputeDto,
  ): Promise<Dispute> {
    const dispute = await this.disputes.findOneBy({ id });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.status === DisputeStatus.RESOLVED)
      throw new ConflictException('Resolved disputes cannot be changed');
    const previousStatus = dispute.status;
    const now = new Date().toISOString();
    this.disputes.merge(dispute, {
      status: dto.status,
      reviewNote: dto.note.trim(),
      reviewedBy: actorId,
      reviewedAt: now,
      updatedAt: now,
      ...(dto.status === DisputeStatus.RESOLVED
        ? { resolvedAt: now }
        : { resolvedAt: undefined }),
    });
    const saved = await this.disputes.save(dispute);
    await this.audit.record({
      actor: actorId,
      action: 'admin.dispute.reviewed',
      entity: 'dispute',
      entityId: id,
      metadata: {
        previousStatus,
        newStatus: saved.status,
        hasReviewNote: true,
      },
    });
    await Promise.allSettled([
      this.notifications.create({
        userId: dispute.openedBy,
        type: NotificationType.DISPUTE_UPDATED,
        title: 'Dispute updated',
        message: `Your dispute is now ${saved.status}.`,
        href: '/disputes',
      }),
    ]);
    return saved;
  }
}
