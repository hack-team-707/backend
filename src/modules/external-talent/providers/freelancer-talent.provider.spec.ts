import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { ProblemModality } from '../enums/problem-modality.enum';
import { FreelancerTalentMapper } from '../mappers/freelancer-talent.mapper';
import { ExternalTalentQueryBuilderService } from '../services/external-talent-query-builder.service';
import { FreelancerTalentProvider } from './freelancer-talent.provider';

describe('FreelancerTalentProvider', () => {
  it('uses the official public directory without requiring OAuth', async () => {
    const http = {
      get: jest.fn().mockReturnValue(
        of({
          data: {
            status: 'success',
            result: {
              users: [
                {
                  id: 42,
                  username: 'ana-dev',
                  display_name: 'Ana',
                  profile_description: 'NestJS y PostgreSQL',
                  reputation: {
                    entire_history: { overall: 4.9, reviews: 12 },
                  },
                },
              ],
            },
          },
        }),
      ),
    } as unknown as HttpService;
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'FREELANCER_ENABLED') return true;
        if (key === 'FREELANCER_BASE_URL') return 'https://www.freelancer.com';
        if (key === 'FREELANCER_OAUTH_TOKEN') return undefined;
        return fallback;
      }),
    } as unknown as ConfigService;
    const provider = new FreelancerTalentProvider(
      http,
      config,
      new FreelancerTalentMapper(),
      new ExternalTalentQueryBuilderService(),
    );

    const results = await provider.search({
      problemId: 'problem-1',
      title: 'API NestJS',
      description: 'Corregir una API',
      category: 'Software',
      requiredSkills: ['NestJS', 'PostgreSQL'],
      modality: ProblemModality.REMOTE,
      language: 'es',
      limit: 5,
    });

    expect(results[0]).toMatchObject({
      name: 'Ana',
      availability: 'UNKNOWN',
      rating: 4.9,
    });
    expect(http.get).toHaveBeenCalledWith(
      'https://www.freelancer.com/api/users/0.1/users/directory',
      expect.objectContaining({
        headers: {},
        params: expect.objectContaining({
          query: expect.stringContaining('NestJS'),
          compact: false,
          profile_description: true,
          reputation: true,
        }),
      }),
    );
  });
});
