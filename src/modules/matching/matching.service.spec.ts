import { ProblemStatus, ProficiencyLevel, SkillCardStatus } from '../../shared';
import { createMockRepository } from '../../test-utils/typeorm-repository.mock';
import { NotificationsService } from '../notifications/notifications.service';
import { Problem } from '../problems/entities/problem.entity';
import { SkillCard } from '../skill-cards/entities/skill-card.entity';
import { Match } from './entities/match.entity';
import { MatchingService } from './matching.service';

describe('MatchingService', () => {
  it('matches equivalent and more specific capability names', async () => {
    const matches = createMockRepository<Match>();
    const problems = createMockRepository<Problem>();
    const skillCards = createMockRepository<SkillCard>();
    const notifications = {
      createSafely: jest.fn(),
      createForUsersSafely: jest.fn(),
    } as unknown as NotificationsService;
    const service = new MatchingService(
      matches,
      problems,
      skillCards,
      notifications,
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
    });
  });
});
