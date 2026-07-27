import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
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
  UserRole,
} from '../../shared';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { Evidence } from '../evidence/entities/evidence.entity';
import { Problem } from '../problems/entities/problem.entity';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationGateway } from '../notifications/notification.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { SkillCardsService } from '../skill-cards/skill-cards.service';
import { UsersService } from '../users/users.service';
import {
  CreateProjectMessageDto,
  CreateProjectTaskDto,
  ProjectValidationDecision,
  SubmitCompletionDto,
  UpdateProjectTaskDto,
  ValidateProjectDto,
} from './dto/project.dto';
import { ProjectMessage } from './entities/project-message.entity';
import { ProjectInvitation } from './entities/project-invitation.entity';
import { ProjectTask } from './entities/project-task.entity';
import { Project } from './entities/project.entity';
import { ProjectRoomService } from './project-room.service';
import type { ProposalScheduledDeliverable } from '../proposals/entities/proposal.entity';

export interface AcceptedProposalProjectInput {
  proposalId: string;
  problemId: string;
  requesterId: string;
  leadSolverId: string;
  solverIds: string[];
  title: string;
  acceptanceCriteria: string[];
  deliverySchedule: ProposalScheduledDeliverable[];
  price: number;
  currency: string;
}

export interface ProjectParticipantDetails {
  id: string;
  displayName: string;
  email: string;
  role: 'requester' | 'solver';
  isLead: boolean;
  canRemove: boolean;
  allocationPercent: number;
  estimatedAmount: number;
}

export type ProjectWithParticipants = Project & {
  participants: ProjectParticipantDetails[];
  canInviteCollaborators: boolean;
};

export interface ProjectCollaboratorCandidate {
  id: string;
  displayName: string;
  email: string;
  skills: string[];
  matchingSkills: string[];
}

export interface ProjectCollaborationAnalysis {
  provider: string;
  recommendation: 'work_solo' | 'add_collaborators';
  explanation: string;
  requiredSkills: string[];
  coveredSkills: string[];
  missingSkills: string[];
  candidates: ProjectCollaboratorCandidate[];
}

export type ProjectInvitationView = ProjectInvitation & {
  projectTitle: string;
  invitedByName: string;
  totalPrice: number;
  currency: string;
  estimatedAmount: number;
};

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
    @InjectRepository(ProjectInvitation)
    private readonly invitations: Repository<ProjectInvitation>,
    private readonly realtime: NotificationGateway,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
    private readonly skillCards: SkillCardsService,
    private readonly aiEngine: AiEngineService,
    @Optional()
    private readonly room?: ProjectRoomService,
  ) {}

  async createFromAcceptedProposal(
    input: AcceptedProposalProjectInput,
  ): Promise<Project> {
    const existing = await this.projects.findOneBy({
      proposalId: input.proposalId,
    });
    if (existing) {
      await this.room?.ensureRoom(existing);
      return existing;
    }
    const problemProject = await this.projects.findOneBy({
      problemId: input.problemId,
    });
    if (problemProject)
      throw new ConflictException('Problem already has a project');
    const now = new Date().toISOString();
    const solverIds = [...new Set(input.solverIds)].sort();
    let project: Project;
    try {
      project = await this.projects.save(
        this.projects.create({
          id: randomUUID(),
          ...input,
          solverIds,
          leadSolverId: input.leadSolverId,
          participantIds: [...new Set([input.requesterId, ...solverIds])],
          deliverySchedule: input.deliverySchedule,
          totalPrice: input.price,
          currency: input.currency,
          memberShares: { [input.leadSolverId]: 100 },
          status: JobStatus.ACTIVE,
          completionEvidenceIds: [],
          createdAt: now,
          updatedAt: now,
        }),
      );
    } catch (error) {
      const concurrent = await this.projects.findOneBy({
        proposalId: input.proposalId,
      });
      if (!concurrent) throw error;
      await this.room?.ensureRoom(concurrent);
      return concurrent;
    }
    await this.room?.ensureRoom(project);
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

  async findMine(userId: string): Promise<ProjectWithParticipants[]> {
    const projects = await this.projects.find({ order: { updatedAt: 'DESC' } });
    const mine = projects.filter((project) =>
      project.participantIds.includes(userId),
    );
    return Promise.all(
      mine.map((project) => this.withParticipants(project, userId)),
    );
  }

  async findOne(userId: string, id: string): Promise<ProjectWithParticipants> {
    return this.withParticipants(await this.participating(userId, id), userId);
  }

  async findCollaborators(
    userId: string,
    projectId: string,
    query = '',
  ): Promise<ProjectCollaborationAnalysis> {
    const project = await this.leadingSolver(userId, projectId);
    const problem = await this.problems.findOneBy({ id: project.problemId });
    const aiAnalysis = await this.aiEngine.analyzeProblem(
      problem?.description?.trim() || project.title,
    );
    const requiredSkills = this.uniqueSkills(aiAnalysis.requiredSkills);
    const cards = await this.skillCards.findPublished();
    const participantCards = cards.filter((card) =>
      project.participantIds.includes(card.ownerId),
    );
    const teamSkills = this.uniqueSkills(
      participantCards.flatMap((card) => card.tags),
    );
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const [publicUsers, pendingInvitations] = await Promise.all([
      this.users.searchPublic(''),
      this.invitations.find({ where: { projectId, status: 'pending' } }),
    ]);
    const pendingUserIds = new Set(
      pendingInvitations.map((invitation) => invitation.invitedUserId),
    );
    const cardsByOwner = new Map<string, string[]>();
    cards.forEach((card) =>
      cardsByOwner.set(card.ownerId, [
        ...(cardsByOwner.get(card.ownerId) ?? []),
        ...card.tags,
      ]),
    );
    const eligibleUsers = publicUsers.filter(
      (user) =>
        user.roles.includes(UserRole.SOLVER) &&
        !project.participantIds.includes(user.id) &&
        !pendingUserIds.has(user.id),
    );
    const coverage = await this.aiEngine.analyzeSkillCoverage(
      requiredSkills,
      teamSkills,
      eligibleUsers.map((user) => ({
        id: user.id,
        skills: this.uniqueSkills(cardsByOwner.get(user.id) ?? []),
      })),
    );
    const matchesByCandidate = new Map(
      coverage.candidateMatches.map((match) => [match.id, match]),
    );
    const candidates = eligibleUsers
      .map((user): ProjectCollaboratorCandidate => {
        const skills = this.uniqueSkills(cardsByOwner.get(user.id) ?? []);
        const matchingSkills =
          matchesByCandidate.get(user.id)?.matchingSkills ?? [];
        return {
          id: user.id,
          displayName: user.displayName,
          email: user.email,
          skills,
          matchingSkills,
        };
      })
      .filter((candidate) => {
        if (!normalizedQuery) return candidate.matchingSkills.length > 0;
        return (
          candidate.displayName.toLocaleLowerCase().includes(normalizedQuery) ||
          candidate.email.toLocaleLowerCase().includes(normalizedQuery) ||
          candidate.skills.some((skill) =>
            skill.toLocaleLowerCase().includes(normalizedQuery),
          )
        );
      })
      .sort(
        (left, right) =>
          right.matchingSkills.length - left.matchingSkills.length ||
          left.displayName.localeCompare(right.displayName),
      )
      .slice(0, 12);
    const recommendation =
      coverage.missingSkills.length > 0 && candidates.length > 0
        ? 'add_collaborators'
        : 'work_solo';
    return {
      provider: this.aiEngine.providerName,
      recommendation,
      explanation:
        recommendation === 'add_collaborators'
          ? `Conviene sumar apoyo para cubrir ${coverage.missingSkills.join(', ')}.`
          : coverage.missingSkills.length
            ? 'No encontramos aún un perfil publicado que cubra las capacidades faltantes; puedes continuar o buscar manualmente.'
            : 'El equipo actual cubre las capacidades principales detectadas; trabajar con el equipo actual es razonable.',
      requiredSkills,
      coveredSkills: coverage.coveredSkills,
      missingSkills: coverage.missingSkills,
      candidates,
    };
  }

  async inviteCollaborator(
    userId: string,
    projectId: string,
    invitedUserId: string,
    desiredSkills: string[] = [],
    allocationPercent = 20,
  ): Promise<ProjectInvitation> {
    const project = await this.leadingSolver(userId, projectId);
    if (project.participantIds.includes(invitedUserId))
      throw new ConflictException('User already participates in project');
    const invited = await this.users.getPublicById(invitedUserId);
    if (!invited.roles.includes(UserRole.SOLVER))
      throw new ConflictException('Invited user is not a solver');
    const pending = await this.invitations.findOneBy({
      projectId,
      invitedUserId,
      status: 'pending',
    });
    if (pending) return pending;
    const leaderId = project.leadSolverId ?? project.solverIds[0];
    const committedPercent = Object.entries(project.memberShares ?? {})
      .filter(([id]) => id !== leaderId)
      .reduce((total, [, percent]) => total + Number(percent || 0), 0);
    const pendingInvitations = await this.invitations.find({
      where: { projectId, status: 'pending' },
    });
    const pendingPercent = pendingInvitations.reduce(
      (total, item) => total + Number(item.allocationPercent || 0),
      0,
    );
    if (committedPercent + pendingPercent + allocationPercent >= 100)
      throw new ConflictException(
        'Allocated percentages must leave a positive share for the solver lead',
      );
    const now = new Date().toISOString();
    const skills = this.uniqueSkills(desiredSkills);
    const invitation = await this.invitations.save(
      this.invitations.create({
        id: randomUUID(),
        projectId,
        invitedUserId,
        invitedBy: userId,
        desiredSkills: skills,
        allocationPercent,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      }),
    );
    await this.notifications.createSafely({
      userId: invitedUserId,
      type: NotificationType.PROJECT_STARTED,
      title: 'Invitación para colaborar',
      message: skills.length
        ? `Te invitaron al proyecto “${project.title}” para apoyar en ${skills.join(', ')} por ${allocationPercent}% del precio total.`
        : `Te invitaron a colaborar en el proyecto “${project.title}” por ${allocationPercent}% del precio total.`,
      href: '/projects',
    });
    this.realtime.emitToUsers(
      [invitedUserId],
      'project.invitation.created',
      invitation,
    );
    return invitation;
  }

  async findMyInvitations(userId: string): Promise<ProjectInvitationView[]> {
    const invitations = await this.invitations.find({
      where: { invitedUserId: userId, status: 'pending' },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(
      invitations.map(async (invitation) => {
        const [project, inviter] = await Promise.all([
          this.projects.findOneBy({ id: invitation.projectId }),
          this.users.getPublicById(invitation.invitedBy),
        ]);
        return Object.assign(invitation, {
          projectTitle: project?.title ?? 'Proyecto',
          invitedByName: inviter.displayName,
          totalPrice: Number(project?.totalPrice ?? 0),
          currency: project?.currency ?? 'PEN',
          estimatedAmount:
            (Number(project?.totalPrice ?? 0) *
              Number(invitation.allocationPercent ?? 0)) /
            100,
        });
      }),
    );
  }

  async respondToInvitation(
    userId: string,
    invitationId: string,
    accepted: boolean,
  ): Promise<ProjectInvitation> {
    const invitation = await this.invitations.findOneBy({ id: invitationId });
    if (!invitation)
      throw new NotFoundException('Project invitation not found');
    if (invitation.invitedUserId !== userId)
      throw new ForbiddenException('Invitation does not belong to this user');
    if (invitation.status !== 'pending')
      throw new ConflictException('Invitation was already answered');
    const project = await this.projects.findOneBy({
      id: invitation.projectId,
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.status !== JobStatus.ACTIVE)
      throw new ConflictException('Project is not active');
    const now = new Date().toISOString();
    invitation.status = accepted ? 'accepted' : 'rejected';
    invitation.respondedAt = now;
    invitation.updatedAt = now;
    await this.invitations.save(invitation);
    const invited = await this.users.getPublicById(userId);
    if (accepted) {
      project.solverIds = [...new Set([...project.solverIds, userId])];
      project.participantIds = [
        ...new Set([...project.participantIds, userId]),
      ];
      const leaderId = project.leadSolverId ?? project.solverIds[0];
      const shares = {
        ...(project.memberShares ?? {}),
        [userId]: Number(invitation.allocationPercent ?? 0),
      };
      const collaboratorPercent = Object.entries(shares)
        .filter(([id]) => id !== leaderId)
        .reduce((total, [, percent]) => total + Number(percent || 0), 0);
      shares[leaderId] = 100 - collaboratorPercent;
      project.memberShares = shares;
      project.updatedAt = now;
      await this.projects.save(project);
      await this.room?.participantAdded(project, invitation.invitedBy, userId);
    }
    await this.notifications.createSafely({
      userId: invitation.invitedBy,
      type: NotificationType.PROJECT_STARTED,
      title: accepted ? 'Invitación aceptada' : 'Invitación rechazada',
      message: `${invited.displayName} ${accepted ? 'aceptó' : 'rechazó'} colaborar en “${project.title}”.`,
      href: `/projects/${project.id}`,
    });
    this.realtime.emitToUsers(
      [...new Set([...project.participantIds, userId])],
      accepted ? 'project.participant.added' : 'project.invitation.responded',
      { projectId: project.id, participantId: userId, accepted },
    );
    return invitation;
  }

  async removeCollaborator(
    userId: string,
    projectId: string,
    collaboratorId: string,
    reason: string,
  ): Promise<ProjectWithParticipants> {
    const project = await this.leadingSolver(userId, projectId);
    const leaderId = project.leadSolverId ?? project.solverIds[0];
    if (
      collaboratorId === project.requesterId ||
      collaboratorId === leaderId ||
      !project.solverIds.includes(collaboratorId)
    )
      throw new ForbiddenException('This participant cannot be removed');
    const removed = await this.users.getPublicById(collaboratorId);
    project.solverIds = project.solverIds.filter((id) => id !== collaboratorId);
    project.participantIds = project.participantIds.filter(
      (id) => id !== collaboratorId,
    );
    const shares = { ...(project.memberShares ?? {}) };
    delete shares[collaboratorId];
    shares[leaderId] =
      100 -
      Object.entries(shares)
        .filter(([id]) => id !== leaderId)
        .reduce((total, [, percent]) => total + Number(percent || 0), 0);
    project.memberShares = shares;
    project.updatedAt = new Date().toISOString();
    await this.projects.save(project);
    await this.room?.participantRemoved(project, userId, collaboratorId);
    await this.notifications.createSafely({
      userId: collaboratorId,
      type: NotificationType.PROJECT_STARTED,
      title: 'Saliste del equipo del proyecto',
      message: `Motivo indicado por el líder: ${reason.trim()}`,
      href: '/projects',
    });
    if (project.requesterId !== userId) {
      await this.notifications.createSafely({
        userId: project.requesterId,
        type: NotificationType.PROJECT_STARTED,
        title: 'Cambio en el equipo',
        message: `${removed.displayName} fue retirado del equipo. Motivo: ${reason.trim()}`,
        href: `/projects/${project.id}`,
      });
    }
    this.realtime.emitToUsers(
      [...new Set([...project.participantIds, collaboratorId])],
      'project.participant.removed',
      { projectId, participantId: collaboratorId, reason: reason.trim() },
    );
    return this.withParticipants(project, userId);
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

  private async withParticipants(
    project: Project,
    currentUserId: string,
  ): Promise<ProjectWithParticipants> {
    const users = await this.users.findPublicByIds(project.participantIds);
    const usersById = new Map(users.map((user) => [user.id, user]));
    return Object.assign(project, {
      canInviteCollaborators:
        project.status === JobStatus.ACTIVE &&
        (project.leadSolverId ?? project.solverIds[0]) === currentUserId,
      participants: project.participantIds.map((id) => {
        const user = usersById.get(id);
        const role: ProjectParticipantDetails['role'] =
          id === project.requesterId ? 'requester' : 'solver';
        const leaderId = project.leadSolverId ?? project.solverIds[0];
        const allocationPercent = Number(project.memberShares?.[id] ?? 0);
        return {
          id,
          displayName: user?.displayName || 'Participante',
          email: user?.email || '',
          role,
          isLead: id === leaderId,
          canRemove:
            currentUserId === leaderId && role === 'solver' && id !== leaderId,
          allocationPercent,
          estimatedAmount:
            (Number(project.totalPrice ?? 0) * allocationPercent) / 100,
        };
      }),
    });
  }

  private async leadingSolver(
    userId: string,
    projectId: string,
  ): Promise<Project> {
    const project = await this.activeParticipant(userId, projectId);
    const leaderId = project.leadSolverId ?? project.solverIds[0];
    if (leaderId !== userId)
      throw new ForbiddenException(
        'Only the project solver lead can invite collaborators',
      );
    return project;
  }

  private uniqueSkills(skills: string[]): string[] {
    const seen = new Set<string>();
    return skills
      .map((skill) => skill.trim())
      .filter((skill) => {
        const normalized = skill.toLocaleLowerCase();
        if (!normalized || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });
  }

  private skillsOverlap(left: string, right: string): boolean {
    const normalizedLeft = left.trim().toLocaleLowerCase();
    const normalizedRight = right.trim().toLocaleLowerCase();
    return (
      normalizedLeft === normalizedRight ||
      normalizedLeft.includes(normalizedRight) ||
      normalizedRight.includes(normalizedLeft)
    );
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
    const now = new Date().toISOString();
    const message = await this.messages.save(
      this.messages.create({
        id: randomUUID(),
        projectId,
        senderId,
        type,
        ...(text ? { text } : {}),
        attachmentUrls,
        mentionUserIds: [],
        reactions: {},
        createdAt: now,
        updatedAt: now,
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
