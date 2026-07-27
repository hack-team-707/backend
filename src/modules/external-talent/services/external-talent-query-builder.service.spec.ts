import { ProblemModality } from '../enums/problem-modality.enum';
import { ExternalTalentQueryBuilderService } from './external-talent-query-builder.service';

describe('ExternalTalentQueryBuilderService', () => {
  const service = new ExternalTalentQueryBuilderService();
  const base = {
    problemId: '159630b4-cae4-4b1d-bbad-8907d6490d9e',
    title: 'Necesito ayuda',
    description: 'Problema por resolver',
    category: 'Servicios',
    requiredSkills: ['Diagnóstico'],
    internalCandidatesFound: 0,
    language: 'es',
    limit: 10,
    minimumInternalMatch: 70,
  };

  it.each([
    ['Desarrollar una API NestJS', ProblemModality.REMOTE],
    ['Instalar cámaras y cableado', ProblemModality.LOCAL],
    [
      'Desarrollar el software e instalar cámaras presencialmente',
      ProblemModality.HYBRID,
    ],
  ])('classifies %s as %s', (description, expected) => {
    expect(service.classify({ ...base, description })).toBe(expected);
  });

  it('strips URLs and control characters from provider queries', () => {
    const input = service.build({
      ...base,
      description: 'Ver https://secret.example/token\npara soporte',
      requiredSkills: ['Soporte remoto'],
    });
    expect(service.freelancerQuery(input)).not.toContain('https://');
    expect(service.freelancerQuery(input)).not.toContain('\n');
  });
});
