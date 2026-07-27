import { ProblemStatus } from '../../shared';
import { createMockRepository } from '../../test-utils/typeorm-repository.mock';
import { Match } from '../matching/entities/match.entity';
import { NoMatchResolution } from '../matching/entities/no-match-resolution.entity';
import { User } from '../users/entities/user.entity';
import { Problem } from './entities/problem.entity';
import { PublicProblemsService } from './public-problems.service';

describe('PublicProblemsService', () => {
  it('returns a sanitized public problem with required skills', async () => {
    const problems = createMockRepository<Problem>();
    const matches = createMockRepository<Match>();
    const noMatchResolutions = createMockRepository<NoMatchResolution>();
    const users = createMockRepository<User>();
    const service = new PublicProblemsService(
      problems,
      matches,
      noMatchResolutions,
      users,
    );

    await users.save({
      id: 'owner-1',
      displayName: 'Cliente Resolve',
      email: 'private@example.com',
      passwordHash: 'private',
      roles: [],
      createdAt: '2026-07-27T10:00:00.000Z',
      updatedAt: '2026-07-27T10:00:00.000Z',
    });
    await problems.save({
      id: 'problem-1',
      ownerId: 'owner-1',
      description: 'Necesito desarrollar una aplicación web',
      audioUrl: 'https://private.example/audio',
      imageUrls: ['https://private.example/image'],
      attachmentUrls: ['https://private.example/file'],
      encryptedGeolocation: 'private',
      hasGeolocation: true,
      status: ProblemStatus.MATCHING,
      createdAt: '2026-07-27T10:00:00.000Z',
      updatedAt: '2026-07-27T11:00:00.000Z',
    });
    await matches.save({
      id: 'match-1',
      problemId: 'problem-1',
      requesterId: 'owner-1',
      solverId: 'solver-1',
      skillCardIds: [],
      requiredSkills: [{ skillId: 'react', name: 'React', weight: 1 }],
      matchedSkillIds: [],
      score: 70,
      coverage: 100,
      explanation: [],
      status: 'suggested',
      createdAt: '2026-07-27T10:00:00.000Z',
      updatedAt: '2026-07-27T10:00:00.000Z',
    } as Match);

    await expect(service.findOne('problem-1')).resolves.toEqual(
      expect.objectContaining({
        id: 'problem-1',
        owner: { id: 'owner-1', displayName: 'Cliente Resolve' },
        requiredSkills: [{ skillId: 'react', name: 'React' }],
        mediaCount: 3,
        hasApproximateLocation: true,
      }),
    );
    const result = await service.findOne('problem-1');
    expect(result).not.toHaveProperty('owner.email');
    expect(result).not.toHaveProperty('encryptedGeolocation');
    expect(result).not.toHaveProperty('attachmentUrls');
  });

  it('does not expose drafts', async () => {
    const problems = createMockRepository<Problem>();
    const service = new PublicProblemsService(
      problems,
      createMockRepository<Match>(),
      createMockRepository<NoMatchResolution>(),
      createMockRepository<User>(),
    );
    await problems.save({
      id: 'draft-1',
      ownerId: 'owner-1',
      description: 'Privado',
      imageUrls: [],
      attachmentUrls: [],
      hasGeolocation: false,
      status: ProblemStatus.DRAFT,
      createdAt: '2026-07-27T10:00:00.000Z',
      updatedAt: '2026-07-27T10:00:00.000Z',
    });

    await expect(service.findOne('draft-1')).rejects.toThrow(
      'Public problem not found',
    );
  });
});
