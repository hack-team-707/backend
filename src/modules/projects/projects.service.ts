import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import {
  EvidenceStatus,
  EvidenceType,
  JobStatus,
  ProblemStatus,
  ProjectMessageType,
  ProjectTaskStatus,
} from '../../shared';
import { Evidence } from '../evidence/entities/evidence.entity';
import { Problem } from '../problems/entities/problem.entity';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationGateway } from '../notifications/notification.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateProjectMessageDto,
  CreateProjectTaskDto,
  ProjectValidationDecision,
  SubmitCompletionDto,
  UpdateProjectTaskDto,
  ValidateProjectDto,
} from './dto/project.dto';
import { ProjectMessage } from './entities/project-message.entity';
import { ProjectTask } from './entities/project-task.entity';
import { Project } from './entities/project.entity';
import type { ProposalScheduledDeliverable } from '../proposals/entities/proposal.entity';

export interface AcceptedProposalProjectInput {
  proposalId: string;
  problemId: string;
  requesterId: string;
  solverIds: string[];
  title: string;
  acceptanceCriteria: string[];
  deliverySchedule: ProposalScheduledDeliverable[];
}

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(ProjectTask)
    private readonly tasks: Repository<ProjectTask>,
    @InjectRepository(ProjectMessage)
    private readonly messages: Repository<ProjectMessage>,
    @InjectRepository(Problem) private readonly problems: Repository<Problem>,
    @InjectRepository(Evidence)
    private readonly evidence: Repository<Evidence>,
    private readonly realtime: NotificationGateway,
    private readonly notifications: NotificationsService,
  ) {}

  async createFromAcceptedProposal(
    input: AcceptedProposalProjectInput,
  ): Promise<Project> {
    const existing = await this.projects.findOneBy({
      proposalId: input.proposalId,
    });
    if (existing) return existing;
    const problemProject = await this.projects.findOneBy({
      problemId: input.problemId,
    });
    if (problemProject)
      throw new ConflictException('Problem already has a project');
    const now = new Date().toISOString();
    const solverIds = [...new Set(input.solverIds)].sort();
    const project = await this.projects.save(
      this.projects.create({
        id: randomUUID(),
        ...input,
        solverIds,
        participantIds: [...new Set([input.requesterId, ...solverIds])],
        deliverySchedule: input.deliverySchedule,
        status: JobStatus.ACTIVE,
        completionEvidenceIds: [],
        createdAt: now,
        updatedAt: now,
      }),
    );
    await this.notifications.createForUsersSafely(
      project.participantIds,
      {
        type: NotificationType.PROJECT_STARTED,
        title: 'Proyecto iniciado',
        message: `El proyecto “${project.title}” ya está activo.`,
        href: `/projects/${project.id}`,
      },
      input.requesterId,
    );
    return project;
  }

  async findMine(userId: string): Promise<Project[]> {
    const projects = await this.projects.find({ order: { updatedAt: 'DESC' } });
    return projects.filter((project) =>
      project.participantIds.includes(userId),
    );
  }

  findOne(userId: string, id: string): Promise<Project> {
    return this.participating(userId, id);
  }

  async createTask(
    userId: string,
    projectId: string,
    dto: CreateProjectTaskDto,
  ): Promise<ProjectTask> {
    const project = await this.activeParticipant(userId, projectId);
    if (!project.participantIds.includes(dto.assigneeId))
      throw new ForbiddenException('Assignee is not a project participant');
    const now = new Date().toISOString();
    return this.tasks.save(
      this.tasks.create({
        id: randomUUID(),
        projectId,
        title: dto.title.trim(),
        ...(dto.description?.trim()
          ? { description: dto.description.trim() }
          : {}),
        assigneeId: dto.assigneeId,
        status: ProjectTaskStatus.TODO,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  async findTasks(userId: string, projectId: string): Promise<ProjectTask[]> {
    await this.participating(userId, projectId);
    return this.tasks.find({
      where: { projectId },
      order: { createdAt: 'ASC' },
    });
  }

  async updateTask(
    userId: string,
    projectId: string,
    taskId: string,
    dto: UpdateProjectTaskDto,
  ): Promise<ProjectTask> {
    const project = await this.activeParticipant(userId, projectId);
    const task = await this.tasks.findOneBy({ id: taskId, projectId });
    if (!task) throw new NotFoundException('Project task not found');
    if (userId !== project.requesterId && userId !== task.assigneeId)
      throw new ForbiddenException(
        'Only requester or assignee can update task',
      );
    if (dto.assigneeId && !project.participantIds.includes(dto.assigneeId))
      throw new ForbiddenException('Assignee is not a project participant');
    this.tasks.merge(task, {
      ...(dto.title ? { title: dto.title.trim() } : {}),
      ...(dto.description ? { description: dto.description.trim() } : {}),
      ...(dto.assigneeId ? { assigneeId: dto.assigneeId } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      updatedAt: new Date().toISOString(),
    });
    return this.tasks.save(task);
  }

  async addMessage(
    userId: string,
    projectId: string,
    dto: CreateProjectMessageDto,
  ): Promise<ProjectMessage> {
    await this.participating(userId, projectId);
    return this.saveMessage(
      projectId,
      userId,
      ProjectMessageType.MESSAGE,
      dto.text?.trim(),
      dto.attachmentUrls ?? [],
    );
  }

  async findMessages(
    userId: string,
    projectId: string,
  ): Promise<ProjectMessage[]> {
    await this.participating(userId, projectId);
    return this.messages.find({
      where: { projectId },
      order: { createdAt: 'ASC' },
    });
  }

  async submitCompletion(
    userId: string,
    projectId: string,
    dto: SubmitCompletionDto,
  ): Promise<Project> {
    const project = await this.activeParticipant(userId, projectId);
    if (!project.solverIds.includes(userId))
      throw new ForbiddenException('Only a solver can submit completion');
    const evidenceIds = [...new Set(dto.evidenceIds ?? [])];
    if (evidenceIds.length) {
      const items = await Promise.all(
        evidenceIds.map((id) => this.evidence.findOneBy({ id })),
      );
      const valid = items.every(
        (item) =>
          item?.projectId === projectId &&
          item.submittedBy === userId &&
          item.type === EvidenceType.COMPLETION &&
          [EvidenceStatus.SUBMITTED, EvidenceStatus.ACCEPTED].includes(
            item.status,
          ),
      );
      if (!valid)
        throw new ForbiddenException(
          'Completion evidence must exist and belong to this solver and project',
        );
    }
    const problem = await this.problems.findOneBy({ id: project.problemId });
    if (!problem) throw new NotFoundException('Problem not found');
    const now = new Date().toISOString();
    this.projects.merge(project, {
      status: JobStatus.PENDING_VALIDATION,
      completionNote: dto.note.trim(),
      completionEvidenceIds: evidenceIds,
      updatedAt: now,
    });
    this.problems.merge(problem, {
      status: ProblemStatus.IN_VALIDATION,
      updatedAt: now,
    });
    await this.saveMessage(
      projectId,
      userId,
      ProjectMessageType.COMPLETION,
      dto.note.trim(),
    );
    await this.problems.save(problem);
    const saved = await this.projects.save(project);
    if (project.requesterId !== userId) {
      await this.notifications.createSafely({
        userId: project.requesterId,
        type: NotificationType.VALIDATION_REQUESTED,
        title: 'Trabajo listo para validar',
        message: `El solucionador solicitó validar “${project.title}”.`,
        href: `/projects/${project.id}`,
      });
    }
    return saved;
  }

  async validate(
    userId: string,
    projectId: string,
    dto: ValidateProjectDto,
  ): Promise<Project> {
    const project = await this.participating(userId, projectId);
    if (project.requesterId !== userId)
      throw new ForbiddenException('Only requester can validate project');
    if (project.status !== JobStatus.PENDING_VALIDATION)
      throw new ConflictException('Project is not pending validation');
    const problem = await this.problems.findOneBy({ id: project.problemId });
    if (!problem) throw new NotFoundException('Problem not found');
    const now = new Date().toISOString();
    const accepted = dto.decision === ProjectValidationDecision.ACCEPT;
    this.projects.merge(project, {
      status: accepted ? JobStatus.CLOSED : JobStatus.ACTIVE,
      validationNote: dto.note.trim(),
      updatedAt: now,
      ...(accepted ? { closedAt: now } : { closedAt: undefined }),
    });
    this.problems.merge(problem, {
      status: accepted ? ProblemStatus.RESOLVED : ProblemStatus.IN_EXECUTION,
      updatedAt: now,
    });
    await this.saveMessage(
      projectId,
      userId,
      accepted
        ? ProjectMessageType.VALIDATION
        : ProjectMessageType.ADDITIONAL_WORK,
      dto.note.trim(),
    );
    await this.problems.save(problem);
    const saved = await this.projects.save(project);
    await this.notifications.createForUsersSafely(
      project.solverIds,
      {
        type: NotificationType.PROJECT_COMPLETED,
        title: accepted ? 'Trabajo validado' : 'Se solicitó trabajo adicional',
        message: dto.note.trim(),
        href: `/projects/${project.id}`,
      },
      userId,
    );
    return saved;
  }

  private async activeParticipant(
    userId: string,
    id: string,
  ): Promise<Project> {
    const project = await this.participating(userId, id);
    if (project.status !== JobStatus.ACTIVE)
      throw new ConflictException('Project is not active');
    return project;
  }

  private async participating(userId: string, id: string): Promise<Project> {
    const project = await this.projects.findOneBy({ id });
    if (!project) throw new NotFoundException('Project not found');
    if (!project.participantIds.includes(userId))
      throw new ForbiddenException('User is not a project participant');
    return project;
  }

  private async saveMessage(
    projectId: string,
    senderId: string,
    type: ProjectMessageType,
    text?: string,
    attachmentUrls: string[] = [],
  ): Promise<ProjectMessage> {
    const message = await this.messages.save(
      this.messages.create({
        id: randomUUID(),
        projectId,
        senderId,
        type,
        ...(text ? { text } : {}),
        attachmentUrls,
        createdAt: new Date().toISOString(),
      }),
    );
    const project = await this.projects.findOneBy({ id: projectId });
    if (project) {
      this.realtime.emitToUsers(
        project.participantIds,
        'project.message.created',
        message,
      );
      if (type === ProjectMessageType.MESSAGE) {
        await this.notifications.createForUsersSafely(
          project.participantIds,
          {
            type: NotificationType.PROJECT_MESSAGE,
            title: 'Nuevo mensaje del proyecto',
            message:
              text?.slice(0, 160) || 'Recibiste un archivo en el proyecto.',
            href: `/projects/${project.id}`,
          },
          senderId,
        );
      }
    }
    return message;
  }
}
