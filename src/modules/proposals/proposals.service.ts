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
  MatchStatus,
  ProblemStatus,
  ProposalStatus,
  TeamStatus,
} from '../../shared';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { Match } from '../matching/entities/match.entity';
import { Problem } from '../problems/entities/problem.entity';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationGateway } from '../notifications/notification.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectsService } from '../projects/projects.service';
import { Team } from '../team-formation/entities/team.entity';
import {
  RespondToProposalDto,
  ReviseProposalDto,
  SubmitProposalDto,
  ProposalTeamMemberDto,
} from './dto/proposal.dto';
import { Proposal } from './entities/proposal.entity';

@Injectable()
export class ProposalsService {
  constructor(
    @InjectRepository(Proposal)
    private readonly proposals: Repository<Proposal>,
    @InjectRepository(Problem) private readonly problems: Repository<Problem>,
    @InjectRepository(Match) private readonly matches: Repository<Match>,
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    private readonly aiEngine: AiEngineService,
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: NotificationGateway,
  ) {}

  async generateDraft(
    solverId: string,
    matchId: string,
    instruction: string,
    currentDraft?: string,
  ) {
    const match = await this.matches.findOneBy({ id: matchId, solverId });
    if (!match) throw new NotFoundException('Opportunity match not found');
    const problem = await this.problems.findOneBy({ id: match.problemId });
    if (!problem) throw new NotFoundException('Problem not found');
    const teams = await this.teams.find({
      where: { problemId: match.problemId },
    });
    const team = teams.find(
      (item) =>
        item.status === TeamStatus.CONFIRMED &&
        item.members.some((member) => member.solverId === solverId),
    );
    const draft = await this.aiEngine.generateProposalDraft({
      problem:
        problem.description?.trim() || 'Problema sin descripción textual',
      requiredSkills: match.requiredSkills.map((skill) => skill.name),
      matchExplanation: match.explanation,
      teamResponsibilities:
        team?.members.map(
          (member) =>
            `${member.solverId}: ${member.responsibilitySkillIds.join(', ')}`,
        ) ?? [],
      userInstruction: instruction.trim(),
      ...(currentDraft ? { currentDraft } : {}),
    });
    return {
      ...draft,
      provider: this.aiEngine.providerName,
      problemId: match.problemId,
      ...(team ? { teamId: team.id } : {}),
      teamMembers:
        team?.members.map((member) => ({
          userId: member.solverId,
          responsibility: member.responsibilitySkillIds.join(', '),
        })) ?? [],
    };
  }

  async submit(solverId: string, dto: SubmitProposalDto): Promise<Proposal> {
    const problem = await this.problems.findOneBy({ id: dto.problemId });
    if (!problem) throw new NotFoundException('Problem not found');
    const existing = await this.proposals.findOne({
      where: { problemId: dto.problemId, submittedBy: solverId },
      order: { createdAt: 'DESC' },
    });
    if (existing) return existing;
    const solverIds = await this.authorizedSolvers(solverId, dto);
    const now = new Date().toISOString();
    const proposalInput = this.proposals.create({
      id: randomUUID(),
      problemId: dto.problemId,
      requesterId: problem.ownerId,
      submittedBy: solverId,
      ...(dto.teamId ? { teamId: dto.teamId } : {}),
      solverIds,
      summary: dto.summary.trim(),
      scope: dto.scope.trim(),
      activities: dto.activities.map((activity) => ({
        title: activity.title.trim(),
        description: activity.description.trim(),
      })),
      teamMembers: (dto.teamMembers ?? []).map((member) => ({
        solverId: member.solverId,
        responsibilities: member.responsibilities.map((item) => item.trim()),
      })),
      deliverables: dto.deliverables.map((item) => item.trim()),
      deliverySchedule: dto.deliverySchedule.map((item) => ({
        id: randomUUID(),
        title: item.title.trim(),
        description: item.description.trim(),
        dueDate: item.dueDate,
      })),
      estimatedDuration: dto.estimatedDuration.trim(),
      price: dto.price,
      currency: dto.currency.toUpperCase(),
      conditions: dto.conditions.map((item) => item.trim()),
      acceptanceCriteria: dto.acceptanceCriteria.map((item) => item.trim()),
      status: ProposalStatus.SUBMITTED,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });
    let proposal: Proposal;
    try {
      proposal = await this.proposals.save(proposalInput);
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const concurrent = await this.proposals.findOneBy({
        problemId: dto.problemId,
        submittedBy: solverId,
      });
      if (!concurrent) throw error;
      return concurrent;
    }
    await this.matches.update(
      { problemId: dto.problemId, solverId },
      { status: MatchStatus.PROPOSAL_SUBMITTED, updatedAt: now },
    );
    this.problems.merge(problem, {
      status: ProblemStatus.PROPOSAL_SENT,
      updatedAt: now,
    });
    await this.problems.save(problem);
    if (problem.ownerId !== solverId) {
      await this.notifications.createSafely({
        userId: problem.ownerId,
        type: NotificationType.PROPOSAL_RECEIVED,
        title: 'Nueva propuesta recibida',
        message: `Recibiste una propuesta para: ${problem.description?.slice(0, 100) ?? 'tu problema publicado'}`,
        href: `/problems?proposal=${proposal.id}`,
      });
      this.realtime.emitToUser(problem.ownerId, 'proposal.created', proposal);
    }
    return proposal;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      !!error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }

  async findMine(userId: string): Promise<Proposal[]> {
    const proposals = await this.proposals.find({
      order: { updatedAt: 'DESC' },
    });
    return proposals.filter(
      (proposal) =>
        proposal.requesterId === userId || proposal.solverIds.includes(userId),
    );
  }

  async findOne(userId: string, id: string): Promise<Proposal> {
    const proposal = await this.proposals.findOneBy({ id });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.requesterId !== userId && !proposal.solverIds.includes(userId))
      throw new ForbiddenException('User cannot access proposal');
    return proposal;
  }

  async respond(
    requesterId: string,
    id: string,
    dto: RespondToProposalDto,
  ): Promise<Proposal> {
    const proposal = await this.findOne(requesterId, id);
    if (proposal.requesterId !== requesterId)
      throw new ForbiddenException('Only requester can respond to proposal');
    if (dto.status === ProposalStatus.ACCEPTED) {
      if (
        ![
          ProposalStatus.SUBMITTED,
          ProposalStatus.REVISED,
          ProposalStatus.ACCEPTED,
        ].includes(proposal.status)
      )
        throw new ConflictException('Proposal cannot be accepted');
      const problem = await this.problems.findOneBy({ id: proposal.problemId });
      if (!problem) throw new NotFoundException('Problem not found');
      await this.projects.createFromAcceptedProposal({
        proposalId: proposal.id,
        problemId: proposal.problemId,
        requesterId,
        solverIds: proposal.solverIds,
        title: proposal.summary,
        acceptanceCriteria: proposal.acceptanceCriteria,
        deliverySchedule: proposal.deliverySchedule,
      });
      const now = new Date().toISOString();
      this.proposals.merge(proposal, {
        status: ProposalStatus.ACCEPTED,
        ...(dto.note?.trim() ? { responseNote: dto.note.trim() } : {}),
        updatedAt: now,
      });
      const saved = await this.proposals.save(proposal);
      this.problems.merge(problem, {
        status: ProblemStatus.IN_EXECUTION,
        updatedAt: now,
      });
      await this.problems.save(problem);
      return saved;
    }
    if (
      ![ProposalStatus.SUBMITTED, ProposalStatus.REVISED].includes(
        proposal.status,
      )
    )
      throw new ConflictException('Proposal cannot be responded to');
    this.proposals.merge(proposal, {
      status: dto.status,
      ...(dto.note?.trim() ? { responseNote: dto.note.trim() } : {}),
      updatedAt: new Date().toISOString(),
    });
    const saved = await this.proposals.save(proposal);
    await this.notifications.createForUsersSafely(
      proposal.solverIds,
      {
        type: NotificationType.PROPOSAL_RESPONDED,
        title:
          dto.status === ProposalStatus.ADJUSTMENT_REQUESTED
            ? 'Solicitaron ajustes a tu propuesta'
            : 'Respondieron a tu propuesta',
        message:
          dto.note?.trim() || `La propuesta cambió al estado ${dto.status}.`,
        href: '/opportunities',
      },
      requesterId,
    );
    return saved;
  }

  async revise(
    solverId: string,
    id: string,
    dto: ReviseProposalDto,
  ): Promise<Proposal> {
    const proposal = await this.findOne(solverId, id);
    if (!proposal.solverIds.includes(solverId))
      throw new ForbiddenException('Only proposal solvers can revise it');
    if (proposal.status !== ProposalStatus.ADJUSTMENT_REQUESTED)
      throw new ConflictException('Proposal has no adjustment request');
    await this.validateProposalMembers(proposal, dto.teamMembers ?? []);
    this.proposals.merge(proposal, {
      summary: dto.summary.trim(),
      scope: dto.scope.trim(),
      activities: dto.activities.map((activity) => ({
        title: activity.title.trim(),
        description: activity.description.trim(),
      })),
      teamMembers: (dto.teamMembers ?? []).map((member) => ({
        solverId: member.solverId,
        responsibilities: member.responsibilities.map((item) => item.trim()),
      })),
      deliverables: dto.deliverables.map((item) => item.trim()),
      deliverySchedule: dto.deliverySchedule.map((item) => ({
        id: randomUUID(),
        title: item.title.trim(),
        description: item.description.trim(),
        dueDate: item.dueDate,
      })),
      estimatedDuration: dto.estimatedDuration.trim(),
      price: dto.price,
      currency: dto.currency.toUpperCase(),
      conditions: dto.conditions.map((item) => item.trim()),
      acceptanceCriteria: dto.acceptanceCriteria.map((item) => item.trim()),
      status: ProposalStatus.REVISED,
      revision: proposal.revision + 1,
      responseNote: undefined,
      updatedAt: new Date().toISOString(),
    });
    const saved = await this.proposals.save(proposal);
    if (proposal.requesterId !== solverId) {
      await this.notifications.createSafely({
        userId: proposal.requesterId,
        type: NotificationType.PROPOSAL_RECEIVED,
        title: 'Propuesta actualizada',
        message: 'El solucionador envió una nueva versión de la propuesta.',
        href: '/projects',
      });
    }
    return saved;
  }

  private async validateProposalMembers(
    proposal: Proposal,
    members: ProposalTeamMemberDto[],
  ): Promise<void> {
    const described = members.map((member) => member.solverId).sort();
    if (proposal.teamId) {
      const team = await this.teams.findOneBy({ id: proposal.teamId });
      if (!team || team.status !== TeamStatus.CONFIRMED)
        throw new ConflictException('Confirmed proposal team was not found');
      const expected = team.members.map((member) => member.solverId).sort();
      if (expected.join(',') !== described.join(','))
        throw new ConflictException('Proposal must describe every team member');
      return;
    }
    if (described.some((memberId) => memberId !== proposal.submittedBy))
      throw new ForbiddenException('Individual proposal cannot include a team');
  }

  private async authorizedSolvers(
    solverId: string,
    dto: SubmitProposalDto,
  ): Promise<string[]> {
    if (dto.teamId) {
      const team = await this.teams.findOneBy({ id: dto.teamId });
      if (!team || team.problemId !== dto.problemId)
        throw new NotFoundException('Team not found for problem');
      if (team.status !== TeamStatus.CONFIRMED)
        throw new ConflictException('Team must be confirmed');
      const lead = team.members.find((member) => member.role === 'lead');
      if (lead?.solverId !== solverId)
        throw new ForbiddenException('Only team lead can submit proposal');
      const solverIds = team.members.map((member) => member.solverId).sort();
      const described = (dto.teamMembers ?? [])
        .map((member) => member.solverId)
        .sort();
      if (solverIds.join(',') !== described.join(','))
        throw new ConflictException('Proposal must describe every team member');
      return solverIds;
    }
    const match = await this.matches.findOneBy({
      problemId: dto.problemId,
      solverId,
    });
    if (!match || match.status !== MatchStatus.ACCEPTED)
      throw new ForbiddenException('Solver must accept the match first');
    if (dto.teamMembers?.some((member) => member.solverId !== solverId))
      throw new ForbiddenException('Individual proposal cannot include a team');
    return [solverId];
  }
}
