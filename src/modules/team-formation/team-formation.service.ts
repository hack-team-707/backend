import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';
import { MatchStatus, ProblemStatus, TeamRole, TeamStatus } from '../../shared';
import { Match } from '../matching/entities/match.entity';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Problem } from '../problems/entities/problem.entity';
import { UsersService } from '../users/users.service';
import { Team, TeamMember } from './entities/team.entity';
import { TeamSuggestionView } from './team-formation.types';

@Injectable()
export class TeamFormationService {
  constructor(
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(Match) private readonly matches: Repository<Match>,
    @InjectRepository(Problem) private readonly problems: Repository<Problem>,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  async form(requesterId: string, problemId: string): Promise<Team> {
    const problem = await this.problems.findOneBy({ id: problemId });
    if (!problem) throw new NotFoundException('Problem not found');
    if (problem.ownerId !== requesterId)
      throw new ForbiddenException('Problem is not owned by user');
    if (problem.status !== ProblemStatus.MATCHING)
      throw new ConflictException('Problem must be in matching status');
    const existingTeam = await this.teams.findOneBy({ problemId });
    if (existingTeam?.status === TeamStatus.CONFIRMED)
      throw new ConflictException('A confirmed team cannot be replaced');

    const candidates = (await this.matches.find({ where: { problemId } }))
      .filter((match) => match.status !== MatchStatus.DECLINED)
      .sort(
        (a, b) => b.score - a.score || a.solverId.localeCompare(b.solverId),
      );
    if (!candidates.length)
      throw new ConflictException('Run matching before forming a team');
    const required = candidates[0].requiredSkills.map((skill) => skill.skillId);
    const uncovered = new Set(required);
    const selected: Match[] = [];
    while (uncovered.size) {
      const next = candidates
        .filter((candidate) => !selected.includes(candidate))
        .map((candidate) => ({
          candidate,
          contribution: candidate.matchedSkillIds.filter((skill) =>
            uncovered.has(skill),
          ).length,
        }))
        .sort(
          (a, b) =>
            b.contribution - a.contribution ||
            b.candidate.score - a.candidate.score ||
            a.candidate.solverId.localeCompare(b.candidate.solverId),
        )[0];
      if (!next || next.contribution === 0) break;
      selected.push(next.candidate);
      next.candidate.matchedSkillIds.forEach((skill) =>
        uncovered.delete(skill),
      );
    }
    if (selected.length < 2 && candidates.length >= 2) {
      const additional = candidates.find(
        (candidate) => !selected.includes(candidate),
      );
      if (additional) selected.push(additional);
    }
    if (selected.length < 2)
      throw new ConflictException(
        'At least two complementary candidates are required to form a team',
      );

    const lead = [...selected].sort(
      (a, b) => b.score - a.score || a.solverId.localeCompare(b.solverId),
    )[0];
    const members: TeamMember[] = selected.map((match) => ({
      solverId: match.solverId,
      matchId: match.id,
      role: match.id === lead.id ? TeamRole.LEAD : TeamRole.MEMBER,
      responsibilitySkillIds: match.matchedSkillIds.filter((skill) =>
        required.includes(skill),
      ),
      score: match.score,
    }));
    const now = new Date().toISOString();
    const coveredSkillIds = required.filter((skill) => !uncovered.has(skill));
    const hasCompleteIndividual = candidates.some(
      (candidate) => candidate.coverage >= 100,
    );
    const coverage =
      required.length === 0
        ? 0
        : Number(((coveredSkillIds.length / required.length) * 100).toFixed(2));
    await this.teams.delete({ problemId });
    const team = await this.teams.save(
      this.teams.create({
        id: randomUUID(),
        problemId,
        requesterId,
        members,
        coveredSkillIds,
        missingSkillIds: [...uncovered],
        coverage,
        rationale: [
          hasCompleteIndividual
            ? 'Existe una persona con cobertura individual completa; este equipo se ofrece como alternativa para repartir responsabilidades y agregar respaldo.'
            : 'Ningún solucionador cubre individualmente todas las capacidades requeridas.',
          hasCompleteIndividual
            ? 'Los integrantes adicionales aportan continuidad y apoyo para ejecutar el trabajo en equipo.'
            : 'Cada integrante aporta capacidades complementarias necesarias para completar la cobertura.',
          'El liderazgo se asignó al integrante con la mayor compatibilidad individual.',
          ...(uncovered.size
            ? [
                `El equipo todavía requiere apoyo en: ${[...uncovered].join(', ')}.`,
              ]
            : []),
        ],
        status: TeamStatus.SUGGESTED,
        createdAt: now,
        updatedAt: now,
      }),
    );
    this.problems.merge(problem, {
      status: ProblemStatus.TEAM_SUGGESTED,
      updatedAt: now,
    });
    await this.problems.save(problem);
    return team;
  }

  async toSuggestion(team: Team): Promise<TeamSuggestionView> {
    const profiles = await this.users.findPublicByIds(
      team.members.map((member) => member.solverId),
    );
    const profileById = new Map(
      profiles.map((profile) => [profile.id, profile]),
    );
    const matches = await this.matches.find({
      where: { problemId: team.problemId },
    });
    const matchById = new Map(matches.map((match) => [match.id, match]));
    const requiredSkills = matches[0]?.requiredSkills ?? [];
    const skillName = (skillId: string) =>
      requiredSkills.find((skill) => skill.skillId === skillId)?.name ??
      skillId;
    const lead = team.members.find((member) => member.role === TeamRole.LEAD);
    const compatibility = team.members.length
      ? team.members.reduce((total, member) => total + member.score, 0) /
        team.members.length
      : 0;

    return {
      id: team.id,
      problemId: team.problemId,
      name: 'Equipo complementario recomendado',
      coverage: team.coverage,
      compatibility: Number(compatibility.toFixed(2)),
      availability: 'pending_confirmation',
      status: team.status,
      leadSolverId: lead?.solverId ?? team.members[0]?.solverId ?? '',
      rationale: team.rationale,
      missingSkills: (team.missingSkillIds ?? []).map(skillName),
      optionalAlternative: matches.some((match) => match.coverage >= 100),
      members: team.members.map((member) => ({
        matchId: member.matchId,
        solverId: member.solverId,
        displayName:
          profileById.get(member.solverId)?.displayName ?? 'Solucionador',
        role: member.role,
        responsibilitySkills: member.responsibilitySkillIds.map((skillId) => {
          const match = matchById.get(member.matchId);
          return (
            match?.requiredSkills.find((skill) => skill.skillId === skillId)
              ?.name ?? skillName(skillId)
          );
        }),
        compatibility: member.score,
        requestStatus:
          matchById.get(member.matchId)?.status ?? MatchStatus.SUGGESTED,
        requestedAt: matchById.get(member.matchId)?.requestedAt,
        reason: member.responsibilitySkillIds.length
          ? `Aporta ${member.responsibilitySkillIds.map(skillName).join(', ')}.`
          : 'Aporta experiencia complementaria al equipo.',
      })),
    };
  }

  async findSuggestionForProblem(
    requesterId: string,
    problemId: string,
  ): Promise<TeamSuggestionView | undefined> {
    const team = await this.teams.findOneBy({ problemId });
    if (!team) return undefined;
    if (team.requesterId !== requesterId)
      throw new ForbiddenException('Team is not owned by requester');
    return this.toSuggestion(team);
  }

  async findOne(userId: string, id: string): Promise<Team> {
    const team = await this.teams.findOneBy({ id });
    if (!team) throw new NotFoundException('Team not found');
    if (
      team.requesterId !== userId &&
      !team.members.some((member) => member.solverId === userId)
    )
      throw new ForbiddenException('User is not a team participant');
    return team;
  }

  async confirm(
    requesterId: string,
    id: string,
    confirmed: boolean,
  ): Promise<TeamSuggestionView> {
    if (!confirmed)
      throw new ForbiddenException('Explicit confirmation is required');
    const team = await this.findOne(requesterId, id);
    if (team.requesterId !== requesterId)
      throw new ForbiddenException('Only requester can confirm team');
    if (team.status === TeamStatus.CONFIRMED) return this.toSuggestion(team);
    if (team.status !== TeamStatus.SUGGESTED)
      throw new ConflictException('Team is not pending confirmation');
    this.teams.merge(team, {
      status: TeamStatus.CONFIRMED,
      updatedAt: new Date().toISOString(),
    });
    const saved = await this.teams.save(team);
    const invitedMatches = await this.matches.findBy({
      id: In(saved.members.map((member) => member.matchId)),
    });
    invitedMatches.forEach((match) => {
      this.matches.merge(match, {
        status: MatchStatus.PENDING,
        requestedAt: saved.updatedAt,
        invitationKind: 'team',
        teamId: saved.id,
        teamRole: saved.members.find((member) => member.matchId === match.id)
          ?.role,
        updatedAt: saved.updatedAt,
      });
    });
    if (invitedMatches.length) await this.matches.save(invitedMatches);
    const problem = await this.problems.findOneBy({ id: saved.problemId });
    await this.notifications.createForUsersSafely(
      saved.members.map((member) => member.solverId),
      {
        type: NotificationType.TEAM_INVITATION,
        title: 'Te invitaron a formar parte de un equipo',
        message: `Fuiste seleccionado para integrar un equipo que resolverá “${problem?.description ?? 'un problema publicado'}”. Confirma si deseas aceptar o rechazar la invitación.`,
        href: `/opportunities?problem=${saved.problemId}`,
      },
      requesterId,
    );
    return this.toSuggestion(saved);
  }
}
