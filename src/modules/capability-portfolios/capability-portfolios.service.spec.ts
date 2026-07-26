import { ConfigService } from '@nestjs/config';
import { ProficiencyLevel } from '../../shared';
import { createMockRepository } from '../../test-utils/typeorm-repository.mock';
import { CapabilityAssessmentState } from '../ai-engine/ai-provider';
import { CapabilityPortfoliosService } from './capability-portfolios.service';
import { CapabilityPortfolio } from './entities/capability-portfolio.entity';

describe('CapabilityPortfoliosService', () => {
  it('creates an idempotent public portfolio from assessment answers', async () => {
    const service = new CapabilityPortfoliosService(
      createMockRepository<CapabilityPortfolio>(),
      {
        getOrThrow: jest.fn().mockReturnValue('http://localhost:3001'),
      } as unknown as ConfigService,
    );
    const assessment: CapabilityAssessmentState = {
      capability: 'Backend con NestJS',
      tags: ['NestJS'],
      questions: [
        { prompt: 'Pregunta 1', options: ['A', 'B', 'C', 'D'] },
        { prompt: 'Pregunta 2', options: ['A', 'B', 'C', 'D'] },
        { prompt: 'Pregunta 3', options: ['A', 'B', 'C', 'D'] },
      ],
      answers: [
        {
          questionIndex: 0,
          selectedOption: 'A',
          answeredAt: new Date().toISOString(),
          timedOut: false,
        },
      ],
      stage: 'evidence_choice',
      result: {
        score: 80,
        suggestedLevel: ProficiencyLevel.ADVANCED,
        strengths: ['Diagnóstico'],
        improvementAreas: ['Observabilidad'],
        summary: 'Buen dominio aplicado.',
        validationStatus: 'ai_assessed',
      },
    };

    const first = await service.createFromAssessment(
      'owner',
      'conversation',
      assessment,
    );
    const second = await service.createFromAssessment(
      'owner',
      'conversation',
      assessment,
    );

    expect(first.url).toMatch(
      /^http:\/\/localhost:3001\/portfolio\/backend-con-nestjs-/,
    );
    expect(second.portfolio.id).toBe(first.portfolio.id);
    await expect(
      service.findPublic(first.portfolio.slug),
    ).resolves.toMatchObject({
      capability: 'Backend con NestJS',
      assessment: { score: 80 },
    });
  });
});
