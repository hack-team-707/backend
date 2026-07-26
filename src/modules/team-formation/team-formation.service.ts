import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { MatchStatus, ProblemStatus, TeamRole, TeamStatus } from '../../shared';
import { Match } from '../matching/entities/match.entity';
import { Problem } from '../problems/entities/problem.entity';
import { Team, TeamMember } from './entities/team.entity';

@Injectable()
export class TeamFormationService {
  constructor(
    @InjectRepository(Team) private readonly teams: Repository<Team>,
    @InjectRepository(Match) private readonly matches: Repository<Match>,
    @InjectRepository(Problem) private readonly problems: Repository<Problem>,
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
    if (candidates[0].coverage >= 70)
      throw new ConflictException(
        'A single solver already covers at least 70%',
      );

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
    if (uncovered.size)
      throw new ConflictException(
        `Cannot cover mandatory skills: ${[...uncovered].join(', ')}`,
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
    await this.teams.delete({ problemId });
    const team = await this.teams.save(
      this.teams.create({
        id: randomUUID(),
        problemId,
        requesterId,
        members,
        coveredSkillIds: required,
        coverage: 100,
        rationale: [
          'No single solver covers at least 70% of required skills.',
          'Members were selected by highest uncovered-skill contribution.',
          `Lead ${lead.solverId} has the highest deterministic match score.`,
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
  ): Promise<Team> {
    if (!confirmed)
      throw new ForbiddenException('Explicit confirmation is required');
    const team = await this.findOne(requesterId, id);
    if (team.requesterId !== requesterId)
      throw new ForbiddenException('Only requester can confirm team');
    if (team.status !== TeamStatus.SUGGESTED)
      throw new ConflictException('Team is not pending confirmation');
    this.teams.merge(team, {
      status: TeamStatus.CONFIRMED,
      updatedAt: new Date().toISOString(),
    });
    return this.teams.save(team);
  }
}
