import { ConfigService } from '@nestjs/config';
import { createMockRepository } from '../../test-utils/typeorm-repository.mock';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { Problem } from '../problems/entities/problem.entity';
import { Match } from './entities/match.entity';
import { OpportunitySearchService } from './opportunity-search.service';

describe('OpportunitySearchService', () => {
  const config = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'HIMALAYAS_API_URL')
        return 'https://himalayas.test/jobs/search';
      if (key === 'FREELANCER_API_URL')
        return 'https://freelancer.test/projects/active/';
      throw new Error(`Unexpected key ${key}`);
    }),
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'EXTERNAL_OPPORTUNITIES_ENABLED') return true;
      if (key === 'EXTERNAL_OPPORTUNITIES_TIMEOUT_MS') return 6000;
      return fallback;
    }),
  } as unknown as ConfigService;

  it('stops after matching an opportunity in the Resolve marketplace', async () => {
    const matches = createMockRepository<Match>();
    const problems = createMockRepository<Problem>();
    await matches.save({
      id: 'match-1',
      problemId: 'problem-1',
      requesterId: 'requester',
      solverId: 'solver',
      skillCardIds: [],
      requiredSkills: [{ skillId: 'nestjs', name: 'NestJS', weight: 1 }],
      matchedSkillIds: ['nestjs'],
      score: 92,
      coverage: 100,
      explanation: ['NestJS compatible'],
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Match);
    await problems.save({
      id: 'problem-1',
      ownerId: 'requester',
      description: 'Construir una API segura con NestJS',
    } as Problem);
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = new OpportunitySearchService(
      matches,
      problems,
      {
        translateOpportunityQueryToEnglish: jest.fn(),
        translateOpportunitiesToSpanish: jest.fn(),
      } as unknown as AiEngineService,
      config,
    );

    const result = await service.search(
      'solver',
      'Muéstrame oportunidades con NestJS',
    );

    expect(result.strategy).toBe('internal_first');
    expect(result.sourcesConsulted).toEqual(['resolve']);
    expect(result.opportunities[0]).toMatchObject({
      source: 'resolve',
      matchScore: 92,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('falls back to Himalayas and Freelancer and localizes their results', async () => {
    const requestedUrls: string[] = [];
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (input) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.startsWith('https://himalayas.test')) {
          return Response.json({
            jobs: [
              {
                guid: 'job-1',
                title: 'Backend Engineer',
                excerpt: 'Build reliable APIs.',
                companyName: 'Example Co',
                categories: ['Backend'],
                applicationLink: 'https://himalayas.app/jobs/job-1',
              },
            ],
          });
        }
        return Response.json({
          result: {
            projects: [
              {
                id: 123,
                title: 'Proyecto NestJS',
                description: 'Construir una API.',
                seo_url: 'nestjs/proyecto-nestjs',
                currency: { code: 'USD' },
                budget: { minimum: 100, maximum: 500 },
                jobs: [{ name: 'NestJS' }],
              },
            ],
          },
        });
      });
    const ai = {
      translateOpportunityQueryToEnglish: jest
        .fn()
        .mockResolvedValue('NestJS backend developer'),
      translateOpportunitiesToSpanish: jest
        .fn()
        .mockImplementation(async (items) =>
          items.map((item: { title: string }) => ({
            ...item,
            title: `ES: ${item.title}`,
            translatedToSpanish: true,
          })),
        ),
    } as unknown as AiEngineService;
    const service = new OpportunitySearchService(
      createMockRepository<Match>(),
      createMockRepository<Problem>(),
      ai,
      config,
    );

    const result = await service.search(
      'solver',
      'Busco proyectos NestJS en español',
    );

    expect(result.strategy).toBe('external_fallback');
    expect(result.sourcesConsulted).toEqual([
      'resolve',
      'himalayas',
      'freelancer',
    ]);
    expect(result.opportunities).toHaveLength(2);
    expect(result.opportunities.every((item) => item.translatedToSpanish)).toBe(
      true,
    );
    expect(requestedUrls).toEqual(
      expect.arrayContaining([
        expect.stringContaining('q=NestJS+backend+developer'),
        expect.stringContaining('query=Busco+proyectos+NestJS+en+espa%C3%B1ol'),
      ]),
    );
    fetchSpy.mockRestore();
  });
});
