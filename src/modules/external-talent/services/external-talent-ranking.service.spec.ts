import { ExternalResultType } from '../enums/external-result-type.enum';
import { TalentProviderName } from '../enums/talent-provider.enum';
import { ExternalTalentRankingService } from './external-talent-ranking.service';

describe('ExternalTalentRankingService', () => {
  const service = new ExternalTalentRankingService();

  it('ranks matches, explains the score and never asserts availability', () => {
    const result = service.rank(
      {
        provider: TalentProviderName.FREELANCER,
        externalId: '42',
        resultType: ExternalResultType.PERSON,
        name: 'Especialista NestJS',
        headline: 'APIs con NestJS y PostgreSQL',
        skills: ['NestJS', 'PostgreSQL'],
        rating: 4.8,
        reviewCount: 120,
        availability: 'AVAILABLE',
        compatibilityScore: 0,
        compatibilityReasons: [],
        missingSkills: [],
      },
      ['NestJS', 'PostgreSQL', 'Docker'],
    );

    expect(result.compatibilityScore).toBeGreaterThan(60);
    expect(result.availability).toBe('UNKNOWN');
    expect(result.missingSkills).toEqual(['Docker']);
    expect(result.compatibilityReasons[0]).toContain('2 capacidades');
  });

  it('redistributes weight when an upstream signal is absent', () => {
    const result = service.rank(
      {
        provider: TalentProviderName.GOOGLE_PLACES,
        externalId: 'place-1',
        resultType: ExternalResultType.BUSINESS,
        name: 'Soporte de redes',
        skills: ['networking'],
        availability: 'UNKNOWN',
        compatibilityScore: 0,
        compatibilityReasons: [],
        missingSkills: [],
      },
      ['Redes'],
    );

    expect(result.compatibilityScore).toBeGreaterThanOrEqual(0);
    expect(result.compatibilityScore).toBeLessThanOrEqual(100);
  });
});
