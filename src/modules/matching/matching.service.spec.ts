import { ProblemStatus, ProficiencyLevel, SkillCardStatus } from '../../shared';
import { createMockRepository } from '../../test-utils/typeorm-repository.mock';
import { NotificationsService } from '../notifications/notifications.service';
import { Problem } from '../problems/entities/problem.entity';
import { SkillCard } from '../skill-cards/entities/skill-card.entity';
import { UsersService } from '../users/users.service';
import { Match } from './entities/match.entity';
import { MatchingService } from './matching.service';
import { NoMatchResolutionService } from './no-match-resolution.service';

describe('MatchingService', () => {
  it('matches equivalent and more specific capability names', async () => {
    const matches = createMockRepository<Match>();
    const problems = createMockRepository<Problem>();
    const skillCards = createMockRepository<SkillCard>();
    const notifications = {
      createSafely: jest.fn(),
      createForUsersSafely: jest.fn(),
    } as unknown as NotificationsService;
    const noMatch = {
      minimumCoverage: 60,
      clear: jest.fn(),
      createOrReplace: jest.fn(),
    } as unknown as NoMatchResolutionService;
    const service = new MatchingService(
      matches,
      problems,
      skillCards,
      notifications,
      noMatch,
      {
        findPublicByIds: jest.fn().mockResolvedValue([]),
      } as unknown as UsersService,
    );
    const now = new Date().toISOString();
    await problems.save({
      id: 'problem-1',
      ownerId: 'requester',
      description: 'La computadora se apaga.',
      imageUrls: [],
      attachmentUrls: [],
      hasGeolocation: false,
      status: ProblemStatus.PUBLISHED,
      createdAt: now,
      updatedAt: now,
    });
    await skillCards.save({
      id: 'requester-card',
      ownerId: 'requester',
      proficiencyLevel: ProficiencyLevel.EXPERT,
      tags: ['Diagnóstico'],
      evidenceLinks: ['https://example.com/requester'],
      status: SkillCardStatus.VALIDATED,
      createdAt: now,
      updatedAt: now,
    });
    await skillCards.save({
      id: 'solver-card',
      ownerId: 'solver',
      proficiencyLevel: ProficiencyLevel.ADVANCED,
      tags: ['Diagnóstico'],
      evidenceLinks: ['https://example.com/solver'],
      status: SkillCardStatus.VALIDATED,
      createdAt: now,
      updatedAt: now,
    });

    const ranked = await service.rank('requester', 'problem-1', {
      requiredSkills: [
        {
          skillId: 'Diagnóstico de hardware',
          name: 'Diagnóstico de hardware',
          weight: 1,
        },
      ],
      limit: 20,
    });

    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({
      solverId: 'solver',
      coverage: 100,
      matchedSkillIds: ['diagnostico de hardware'],
      status: 'suggested',
    });
    expect(notifications.createForUsersSafely).toHaveBeenCalledWith(
      ['solver'],
      expect.objectContaining({
        title: 'Nueva oportunidad compatible',
        href: '/opportunities',
      }),
      'requester',
    );
    await matches.save(ranked[0]);

    await matches.save({
      ...ranked[0],
      id: 'application-match',
    });
    const application = await service.apply('solver', 'application-match');
    expect(application).toMatchObject({
      status: 'accepted',
      invitationKind: undefined,
    });
    expect(notifications.createSafely).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'requester',
        title: 'Un solucionador quiere postular',
        href: '/problems/problem-1',
      }),
    );

    const requested = await service.requestSolver('requester', ranked[0].id);
    expect(requested.status).toBe('pending');
    expect(requested.requestedAt).toBeDefined();
    expect(notifications.createSafely).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'solver',
        title: 'Fuiste seleccionado para un trabajo',
      }),
    );
    expect(ranked[0]).toMatchObject({
      invitationKind: 'individual',
    });

    await service.requestSolver('requester', ranked[0].id);
    expect(notifications.createSafely).toHaveBeenCalledTimes(3);
  });
});
