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
import { RankMatchesDto, RespondToMatchDto } from './dto/matching.dto';
import { Match } from './entities/match.entity';
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
    const ranked = candidates
      .filter((match) => match.coverage >= this.noMatch.minimumCoverage)
      .slice(0, dto.limit);

    const noMatchResolution = ranked.length
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
    const saved = await this.matches.save(ranked);
    if (saved.length) {
      await this.noMatch.clear(problemId);
      await Promise.all([
        this.notifications.createSafely({
          userId: requesterId,
          type: NotificationType.MATCH_FOUND,
          title: 'Encontramos solucionadores',
          message: `${saved.length} solucionador${saved.length === 1 ? '' : 'es'} coincide${saved.length === 1 ? '' : 'n'} con tu problema.`,
          href: '/problems',
        }),
        this.notifications.createForUsersSafely(
          saved.map((match) => match.solverId),
          {
            type: NotificationType.MATCH_FOUND,
            title: 'Nueva oportunidad',
            message:
              'Tu experiencia coincide con un problema publicado en Resolve.',
            href: '/opportunities',
          },
          requesterId,
        ),
      ]);
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

  async findForSolver(solverId: string): Promise<Match[]> {
    return this.matches.find({
      where: { solverId },
      order: { updatedAt: 'DESC' },
    });
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
    if (match.status !== MatchStatus.PENDING)
      throw new ForbiddenException('Only pending matches can be answered');
    this.matches.merge(match, {
      status: dto.status,
      updatedAt: new Date().toISOString(),
    });
    return this.matches.save(match);
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
        `Weighted skill coverage: ${(coverage * 100).toFixed(2)}%`,
        `Proficiency contribution: ${(proficiency * 20).toFixed(2)}/20`,
        `Evidence contribution: ${(evidence * 10).toFixed(2)}/10`,
      ],
      status: MatchStatus.PENDING,
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
      .trim();
  }
}

interface RequiredSkillDto {
  skillId: string;
  name: string;
  weight: number;
}
