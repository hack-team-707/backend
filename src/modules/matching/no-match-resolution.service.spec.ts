import { ConfigService } from '@nestjs/config';
import { createMockRepository } from '../../test-utils/typeorm-repository.mock';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { Problem } from '../problems/entities/problem.entity';
import { NoMatchResolution } from './entities/no-match-resolution.entity';
import { NoMatchResolutionService } from './no-match-resolution.service';

describe('NoMatchResolutionService', () => {
  it('builds skill-specific search URLs and excludes generic Workana landing', async () => {
    const service = new NoMatchResolutionService(
      createMockRepository<NoMatchResolution>(),
      {
        generateNoMatchGuide: jest.fn().mockResolvedValue({
          title: 'Guía',
          steps: ['Documenta el problema'],
          safetyWarnings: [],
          disclaimer: 'Orientación general',
          provider: 'fallback',
        }),
      } as unknown as AiEngineService,
      {
        get: jest.fn((_key: string, fallback: unknown) => fallback),
      } as unknown as ConfigService,
    );

    const resolution = await service.createOrReplace({
      ownerId: 'requester',
      problem: {
        id: 'problem-1',
        description: 'Error de NestJS',
      } as Problem,
      requiredSkills: ['NestJS', 'PostgreSQL'],
      bestCoverage: 0,
    });

    expect(resolution.recommendations.map((item) => item.id)).not.toContain(
      'workana',
    );
    expect(
      resolution.recommendations.find((item) => item.id === 'freelancer')?.url,
    ).toContain('keyword=NestJS%20PostgreSQL');
    expect(
      resolution.recommendations.find((item) => item.id === 'linkedin-services')
        ?.url,
    ).toContain('keywords=NestJS%20PostgreSQL');
  });
});
