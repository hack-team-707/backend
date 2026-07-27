import {
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
  ProficiencyLevel,
  SkillCardStatus,
  TaxonomySkill,
} from '../../shared';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Problem } from '../problems/entities/problem.entity';
import { SkillCard } from '../skill-cards/entities/skill-card.entity';
import { UsersService } from '../users/users.service';
import { RankMatchesDto, RespondToMatchDto } from './dto/matching.dto';
import { Match } from './entities/match.entity';
import { IndividualMatchSuggestionView } from './individual-match.types';
import { NoMatchResolutionService } from './no-match-resolution.service';
import { NoMatchResolutionView } from './no-match-resolution.types';

const PROFICIENCY: Record<ProficiencyLevel, number> = {
  [ProficiencyLevel.BEGINNER]: 0.25,
  [ProficiencyLevel.INTERMEDIATE]: 0.5,
  [ProficiencyLevel.ADVANCED]: 0.75,
  [ProficiencyLevel.EXPERT]: 1,
};

@Injectable()
export class MatchingService {
  constructor(
    @InjectRepository(Match) private readonly matches: Repository<Match>,
    @InjectRepository(Problem) private readonly problems: Repository<Problem>,
    @InjectRepository(SkillCard)
    private readonly skillCards: Repository<SkillCard>,
    private readonly notifications: NotificationsService,
    private readonly noMatch: NoMatchResolutionService,
    private readonly users: UsersService,
  ) {}

  async rank(
    requesterId: string,
    problemId: string,
    dto: RankMatchesDto,
  ): Promise<Match[]> {
    const problem = await this.problems.findOneBy({ id: problemId });
    if (!problem) throw new NotFoundException('Problem not found');
    if (problem.ownerId !== requesterId)
      throw new ForbiddenException('Problem is not owned by user');
    if (
      ![ProblemStatus.PUBLISHED, ProblemStatus.MATCHING].includes(
        problem.status,
      )
    )
      throw new ForbiddenException(
        'Problem must be published or matching before ranking',
      );

    const requiredSkills = this.normalizeRequiredSkills(dto.requiredSkills);
    const cards = await this.skillCards.find();
    const eligible = cards.filter(
      (card) =>
        card.ownerId !== requesterId &&
        [SkillCardStatus.PUBLISHED, SkillCardStatus.VALIDATED].includes(
          card.status,
        ),
    );
    const bySolver = new Map<string, SkillCard[]>();
    for (const card of eligible) {
      const solverCards = bySolver.get(card.ownerId) ?? [];
      solverCards.push(card);
      bySolver.set(card.ownerId, solverCards);
    }

    const now = new Date().toISOString();
    const candidates = [...bySolver.entries()]
      .map(([solverId, solverCards]) =>
        this.scoreCandidate(
          problemId,
          requesterId,
          solverId,
          solverCards,
          requiredSkills,
          now,
        ),
      )
      .sort(
        (a, b) => b.score - a.score || a.solverId.localeCompare(b.solverId),
      );
    const qualified = candidates
      .filter((match) => match.coverage >= this.noMatch.minimumCoverage)
      .slice(0, dto.limit);
    const teamCandidates = candidates
      .filter((match) => match.matchedSkillIds.length > 0)
      .slice(0, dto.limit);

    const noMatchResolution = qualified.length
      ? undefined
      : await this.noMatch.createOrReplace({
          ownerId: requesterId,
          problem,
          requiredSkills: requiredSkills.map((skill) => skill.name),
          bestCoverage: Math.max(
            0,
            ...candidates.map((candidate) => candidate.coverage),
          ),
        });

    await this.matches.delete({ problemId });
    this.problems.merge(problem, {
      status: ProblemStatus.MATCHING,
      updatedAt: now,
    });
    await this.problems.save(problem);
    const saved = await this.matches.save(teamCandidates);
    if (saved.length) {
      if (qualified.length) await this.noMatch.clear(problemId);
      await this.notifications.createSafely({
        userId: requesterId,
        type: NotificationType.MATCH_FOUND,
        title: 'Encontramos solucionadores',
        message: `${saved.length} solucionador${saved.length === 1 ? '' : 'es'} coincide${saved.length === 1 ? '' : 'n'} con tu problema.`,
        href: `/problems/${problemId}`,
      });
      await this.notifications.createForUsersSafely(
        saved.map((match) => match.solverId),
        {
          type: NotificationType.OPPORTUNITY_AVAILABLE,
          title: 'Nueva oportunidad compatible',
          message:
            'Hay un problema nuevo relacionado con tus capacidades. Puedes revisarlo mientras el cliente evalúa a quién seleccionar.',
          href: '/opportunities',
        },
        requesterId,
      );
    } else {
      await this.notifications.createSafely({
        userId: requesterId,
        type: NotificationType.NO_INTERNAL_MATCH,
        title: 'Seguimos buscando una solución',
        message: noMatchResolution?.aiGuide
          ? 'Aún no hay solucionadores locales con la cobertura mínima. Revisa alternativas externas y una guía inicial segura.'
          : 'Aún no hay solucionadores locales con la cobertura mínima. Revisa los canales externos sugeridos.',
        href: `/problems?noMatch=${problemId}`,
      });
    }
    return saved;
  }

  clearNoMatchResolution(problemId: string): Promise<void> {
    return this.noMatch.clear(problemId);
  }

  async findForSolver(solverId: string): Promise<Match[]> {
    return this.matches.find({
      where: { solverId },
      order: { updatedAt: 'DESC' },
    });
  }

  async toSuggestions(
    matches: Match[],
  ): Promise<IndividualMatchSuggestionView[]> {
    const profiles = await this.users.findPublicByIds(
      matches.map((match) => match.solverId),
    );
    const profileById = new Map(
      profiles.map((profile) => [profile.id, profile]),
    );
    return matches.map((match) => {
      const contributedSkills = match.requiredSkills
        .filter((skill) => match.matchedSkillIds.includes(skill.skillId))
        .map((skill) => skill.name);
      return {
        id: match.id,
        problemId: match.problemId,
        solverId: match.solverId,
        displayName:
          profileById.get(match.solverId)?.displayName ?? 'Solucionador',
        coverage: match.coverage,
        compatibility: match.score,
        contributedSkills,
        reason:
          match.explanation[0] ??
          `Cubre ${Math.round(match.coverage)}% de las capacidades requeridas.`,
        availability: 'pending_confirmation' as const,
        status: match.status,
        ...(match.requestedAt ? { requestedAt: match.requestedAt } : {}),
      };
    });
  }

  async requestSolver(
    requesterId: string,
    id: string,
  ): Promise<IndividualMatchSuggestionView> {
    const match = await this.matches.findOneBy({ id });
    if (!match) throw new NotFoundException('Match not found');
    if (match.requesterId !== requesterId)
      throw new ForbiddenException('Match is not owned by requester');
    if (match.status === MatchStatus.DECLINED)
      throw new ForbiddenException('A declined match cannot be requested');
    if (!match.requestedAt) {
      const requestedAt = new Date().toISOString();
      this.matches.merge(match, {
        status: MatchStatus.PENDING,
        requestedAt,
        invitationKind: 'individual',
        teamId: undefined,
        teamRole: undefined,
        updatedAt: requestedAt,
      });
      await this.matches.save(match);
      await this.notifications.createSafely({
        userId: match.solverId,
        type: NotificationType.MATCH_FOUND,
        title: 'Fuiste seleccionado para un trabajo',
        message:
          'Un cliente seleccionó tu perfil para resolver su problema. Confirma si deseas aceptar o rechazar la invitación.',
        href: `/opportunities?problem=${match.problemId}`,
      });
    }
    return (await this.toSuggestions([match]))[0];
  }

  async findForProblem(userId: string, problemId: string): Promise<Match[]> {
    const matches = await this.matches.find({
      where: { problemId },
      order: { score: 'DESC' },
    });
    if (
      matches.length > 0 &&
      matches[0].requesterId !== userId &&
      !matches.some((match) => match.solverId === userId)
    )
      throw new ForbiddenException('User cannot access these matches');
    return matches.filter(
      (match) => match.requesterId === userId || match.solverId === userId,
    );
  }

  async apply(solverId: string, id: string): Promise<Match> {
    const match = await this.matches.findOneBy({ id });
    if (!match) throw new NotFoundException('Match not found');
    if (match.solverId !== solverId)
      throw new ForbiddenException('Match is not assigned to user');
    if (
      [MatchStatus.ACCEPTED, MatchStatus.PROPOSAL_SUBMITTED].includes(
        match.status,
      ) &&
      !match.invitationKind
    ) {
      return match;
    }
    if (match.status !== MatchStatus.SUGGESTED)
      throw new ForbiddenException(
        'Only suggested opportunities accept applications',
      );

    const now = new Date().toISOString();
    this.matches.merge(match, {
      status: MatchStatus.ACCEPTED,
      invitationKind: undefined,
      requestedAt: now,
      updatedAt: now,
    });
    const saved = await this.matches.save(match);
    await this.notifications.createSafely({
      userId: match.requesterId,
      type: NotificationType.MATCH_FOUND,
      title: 'Un solucionador quiere postular',
      message:
        'Un solucionador compatible mostró interés y ya puede preparar una propuesta para tu problema.',
      href: `/problems/${match.problemId}`,
    });
    return saved;
  }

  findNoMatchResolution(
    ownerId: string,
    problemId: string,
  ): Promise<NoMatchResolutionView> {
    return this.noMatch.findForOwner(ownerId, problemId);
  }

  findMyNoMatchResolutions(ownerId: string): Promise<NoMatchResolutionView[]> {
    return this.noMatch.findAllForOwner(ownerId);
  }

  async respond(
    solverId: string,
    id: string,
    dto: RespondToMatchDto,
  ): Promise<Match> {
    const match = await this.matches.findOneBy({ id });
    if (!match) throw new NotFoundException('Match not found');
    if (match.solverId !== solverId)
      throw new ForbiddenException('Match is not assigned to user');
    if (match.status === dto.status) return match;
    if (match.status !== MatchStatus.PENDING)
      throw new ForbiddenException('Only pending matches can be answered');
    this.matches.merge(match, {
      status: dto.status,
      updatedAt: new Date().toISOString(),
    });
    const saved = await this.matches.save(match);
    await this.notifications.createSafely({
      userId: match.requesterId,
      type: NotificationType.MATCH_RESPONSE,
      title:
        dto.status === MatchStatus.ACCEPTED
          ? 'Invitación aceptada'
          : 'Invitación rechazada',
      message:
        dto.status === MatchStatus.ACCEPTED
          ? 'Una persona seleccionada confirmó que desea participar en el trabajo.'
          : 'Una persona seleccionada rechazó la invitación. Puedes elegir otra alternativa.',
      href: `/problems/${match.problemId}`,
    });
    return saved;
  }

  private normalizeRequiredSkills(skills: RequiredSkillDto[]): TaxonomySkill[] {
    const unique = new Map<string, TaxonomySkill>();
    for (const skill of skills) {
      const skillId = this.normalizeSkillKey(skill.skillId || skill.name);
      const current = unique.get(skillId);
      if (!current || skill.weight > current.weight)
        unique.set(skillId, {
          skillId,
          name: skill.name.trim(),
          weight: skill.weight,
        });
    }
    return [...unique.values()].sort((a, b) =>
      a.skillId.localeCompare(b.skillId),
    );
  }

  private scoreCandidate(
    problemId: string,
    requesterId: string,
    solverId: string,
    cards: SkillCard[],
    requiredSkills: TaxonomySkill[],
    now: string,
  ): Match {
    const totalWeight = requiredSkills.reduce(
      (sum, skill) => sum + skill.weight,
      0,
    );
    const matched = requiredSkills.filter((required) =>
      cards.some((card) =>
        card.tags.some((tag) => this.skillMatches(required.skillId, tag)),
      ),
    );
    const matchedWeight = matched.reduce((sum, skill) => sum + skill.weight, 0);
    const coverage = totalWeight === 0 ? 0 : matchedWeight / totalWeight;
    const relevantCards = cards.filter((card) =>
      card.tags.some((tag) =>
        matched.some((skill) => this.skillMatches(skill.skillId, tag)),
      ),
    );
    const proficiency = matchedWeight
      ? matched.reduce((sum, skill) => {
          const skillProficiency = Math.max(
            ...cards
              .filter((card) =>
                card.tags.some((tag) => this.skillMatches(skill.skillId, tag)),
              )
              .map((card) => PROFICIENCY[card.proficiencyLevel]),
          );
          return sum + skill.weight * skillProficiency;
        }, 0) / matchedWeight
      : 0;
    const evidence = Math.min(
      relevantCards.reduce((sum, card) => sum + card.evidenceLinks.length, 0) /
        3,
      1,
    );
    const score = Number(
      (coverage * 70 + proficiency * 20 + evidence * 10).toFixed(2),
    );
    return this.matches.create({
      id: randomUUID(),
      problemId,
      requesterId,
      solverId,
      skillCardIds: relevantCards.map((card) => card.id).sort(),
      requiredSkills,
      matchedSkillIds: matched.map((skill) => skill.skillId),
      score,
      coverage: Number((coverage * 100).toFixed(2)),
      explanation: [
        `Cobertura ponderada de habilidades: ${(coverage * 100).toFixed(2)}%`,
        `Aporte del nivel de dominio: ${(proficiency * 20).toFixed(2)}/20`,
        `Aporte de evidencias: ${(evidence * 10).toFixed(2)}/10`,
      ],
      status: MatchStatus.SUGGESTED,
      requestedAt: undefined,
      invitationKind: undefined,
      teamId: undefined,
      teamRole: undefined,
      createdAt: now,
      updatedAt: now,
    });
  }

  private skillMatches(requiredSkill: string, cardTag: string): boolean {
    const required = this.normalizeSkillKey(requiredSkill);
    const available = this.normalizeSkillKey(cardTag);
    if (!required || !available) return false;
    if (required === available) return true;
    return (
      Math.min(required.length, available.length) >= 4 &&
      (required.includes(available) || available.includes(required))
    );
  }

  private normalizeSkillKey(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9+#.]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(
        /\b(desarrollador|desarrolladora|desarrollo|desarrollar)\b/g,
        'desarroll',
      )
      .replace(/\b(disenador|disenadora|diseno|disenar)\b/g, 'disen')
      .trim();
  }
}

interface RequiredSkillDto {
  skillId: string;
  name: string;
  weight: number;
}
