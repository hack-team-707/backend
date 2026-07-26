import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { EvidenceStatus, EvidenceType, JobStatus } from '../../shared';
import { Project } from '../projects/entities/project.entity';
import { CreateEvidenceDto, ReviewEvidenceDto } from './dto/evidence.dto';
import { Evidence } from './entities/evidence.entity';

@Injectable()
export class EvidenceService {
  constructor(
    @InjectRepository(Evidence)
    private readonly evidence: Repository<Evidence>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
  ) {}

  createProgress(
    userId: string,
    projectId: string,
    dto: CreateEvidenceDto,
  ): Promise<Evidence> {
    return this.create(userId, projectId, EvidenceType.PROGRESS, dto);
  }

  createCompletionEvidence(
    userId: string,
    projectId: string,
    dto: CreateEvidenceDto,
  ): Promise<Evidence> {
    return this.create(userId, projectId, EvidenceType.COMPLETION, dto);
  }

  async findForProject(userId: string, projectId: string): Promise<Evidence[]> {
    await this.participating(userId, projectId);
    return this.evidence.find({
      where: { projectId },
      order: { createdAt: 'ASC' },
    });
  }

  async review(
    userId: string,
    id: string,
    dto: ReviewEvidenceDto,
  ): Promise<Evidence> {
    const item = await this.evidence.findOneBy({ id });
    if (!item) throw new NotFoundException('Evidence not found');
    const project = await this.participating(userId, item.projectId);
    if (project.requesterId !== userId)
      throw new ForbiddenException('Only requester can review evidence');
    if (item.status !== EvidenceStatus.SUBMITTED)
      throw new ConflictException('Evidence was already reviewed');
    const now = new Date().toISOString();
    this.evidence.merge(item, {
      status: dto.status,
      ...(dto.note?.trim() ? { reviewNote: dto.note.trim() } : {}),
      reviewedBy: userId,
      reviewedAt: now,
      updatedAt: now,
    });
    return this.evidence.save(item);
  }

  private async create(
    userId: string,
    projectId: string,
    type: EvidenceType,
    dto: CreateEvidenceDto,
  ): Promise<Evidence> {
    const project = await this.participating(userId, projectId);
    if (!project.solverIds.includes(userId))
      throw new ForbiddenException('Only project solvers can submit evidence');
    if (project.status !== JobStatus.ACTIVE)
      throw new ConflictException('Project is not active');
    const now = new Date().toISOString();
    return this.evidence.save(
      this.evidence.create({
        id: randomUUID(),
        projectId,
        submittedBy: userId,
        type,
        title: dto.title.trim(),
        description: dto.description.trim(),
        ...(dto.referenceUrl ? { referenceUrl: dto.referenceUrl } : {}),
        ...(dto.fileName ? { fileName: dto.fileName.trim() } : {}),
        ...(dto.mimeType ? { mimeType: dto.mimeType.trim() } : {}),
        ...(dto.sizeBytes !== undefined ? { sizeBytes: dto.sizeBytes } : {}),
        status: EvidenceStatus.SUBMITTED,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  private async participating(userId: string, id: string): Promise<Project> {
    const project = await this.projects.findOneBy({ id });
    if (!project) throw new NotFoundException('Project not found');
    if (!project.participantIds.includes(userId))
      throw new ForbiddenException('User is not a project participant');
    return project;
  }
}
