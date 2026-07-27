import { Repository } from 'typeorm';
import { MatchStatus, TeamRole, TeamStatus } from '../../shared';
import { Match } from '../matching/entities/match.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Problem } from '../problems/entities/problem.entity';
import { UsersService } from '../users/users.service';
import { Team } from './entities/team.entity';
import { TeamFormationService } from './team-formation.service';

describe('TeamFormationService', () => {
  it('confirms a team idempotently and invites every member once', async () => {
    const now = '2026-07-27T14:00:00.000Z';
    const team = {
      id: 'team-1',
      problemId: 'problem-1',
      requesterId: 'requester-1',
      members: [
        {
          solverId: 'solver-1',
          matchId: 'match-1',
          role: TeamRole.LEAD,
          responsibilitySkillIds: ['react'],
          score: 90,
        },
        {
          solverId: 'solver-2',
          matchId: 'match-2',
          role: TeamRole.MEMBER,
          responsibilitySkillIds: ['figma'],
          score: 80,
        },
      ],
      coveredSkillIds: ['react', 'figma'],
      missingSkillIds: [],
      coverage: 100,
      rationale: ['Complementary team'],
      status: TeamStatus.SUGGESTED,
      createdAt: now,
      updatedAt: now,
    } as Team;
    const matches = [
      {
        id: 'match-1',
        problemId: 'problem-1',
        solverId: 'solver-1',
        requiredSkills: [{ skillId: 'react', name: 'React', weight: 1 }],
        matchedSkillIds: ['react'],
        score: 90,
        status: MatchStatus.SUGGESTED,
      },
      {
        id: 'match-2',
        problemId: 'problem-1',
        solverId: 'solver-2',
        requiredSkills: [{ skillId: 'figma', name: 'Figma', weight: 1 }],
        matchedSkillIds: ['figma'],
        score: 80,
        status: MatchStatus.SUGGESTED,
      },
    ] as Match[];
    const teams = {
      findOneBy: jest.fn().mockResolvedValue(team),
      merge: jest.fn((target: Team, value: Partial<Team>) =>
        Object.assign(target, value),
      ),
      save: jest.fn(async (value: Team) => value),
    } as unknown as Repository<Team>;
    const matchRepository = {
      findBy: jest.fn().mockResolvedValue(matches),
      find: jest.fn().mockResolvedValue(matches),
      merge: jest.fn((target: Match, value: Partial<Match>) =>
        Object.assign(target, value),
      ),
      save: jest.fn(async (value: Match[]) => value),
    } as unknown as Repository<Match>;
    const problems = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 'problem-1',
        description: 'Construir una aplicación',
      }),
    } as unknown as Repository<Problem>;
    const users = {
      findPublicByIds: jest.fn().mockResolvedValue([
        { id: 'solver-1', displayName: 'Ana' },
        { id: 'solver-2', displayName: 'Luis' },
      ]),
    } as unknown as UsersService;
    const notifications = {
      createForUsersSafely: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsService;
    const service = new TeamFormationService(
      teams,
      matchRepository,
      problems,
      users,
      notifications,
    );

    const confirmed = await service.confirm('requester-1', 'team-1', true);
    const repeated = await service.confirm('requester-1', 'team-1', true);

    expect(confirmed.status).toBe(TeamStatus.CONFIRMED);
    expect(repeated.status).toBe(TeamStatus.CONFIRMED);
    expect(matches.map((match) => match.status)).toEqual([
      MatchStatus.PENDING,
      MatchStatus.PENDING,
    ]);
    expect(matches.map((match) => match.invitationKind)).toEqual([
      'team',
      'team',
    ]);
    expect(matches.map((match) => match.teamRole)).toEqual([
      TeamRole.LEAD,
      TeamRole.MEMBER,
    ]);
    expect(notifications.createForUsersSafely).toHaveBeenCalledTimes(1);
    expect(notifications.createForUsersSafely).toHaveBeenCalledWith(
      ['solver-1', 'solver-2'],
      expect.objectContaining({ href: '/opportunities?problem=problem-1' }),
      'requester-1',
    );
  });
});
