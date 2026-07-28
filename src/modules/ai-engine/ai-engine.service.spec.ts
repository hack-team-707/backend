import { AiProvider } from './ai-provider';
import { AiEngineService, ConversationHistoryItem } from './ai-engine.service';

describe('AiEngineService capability assessment', () => {
  it.each([
    ['Quiero consultar mis proyectos activos', 'project'],
    ['Muéstrame oportunidades de trabajo remoto', 'opportunity'],
    ['Quiero ofrecer y validar mis habilidades de backend', 'capability'],
    ['Necesito resolver un error de autenticación', 'problem'],
  ] as const)(
    'routes "%s" to %s without an external provider',
    async (message, route) => {
      const service = new AiEngineService({
        name: 'disabled',
        analyze: jest.fn(),
        generate: jest.fn(),
      } as unknown as AiProvider);

      await expect(
        service.routeResolveRequest({
          conversationType: 'inquiry',
          message,
          history: [],
        }),
      ).resolves.toMatchObject({ route, provider: 'fallback' });
    },
  );

  it('generates a structured proposal draft with scheduled deliverables', async () => {
    const provider = {
      name: 'nvidia' as const,
      analyze: jest.fn(),
      generate: jest.fn().mockResolvedValue(
        JSON.stringify({
          summary: 'Implementación de una solución verificable',
          scope: 'Análisis, implementación y validación.',
          activities: [
            { title: 'Analizar', description: 'Validar requisitos.' },
            { title: 'Construir', description: 'Implementar la solución.' },
          ],
          deliverables: [
            {
              title: 'Diagnóstico',
              description: 'Informe inicial.',
              dueOffsetDays: 2,
            },
            {
              title: 'Entrega final',
              description: 'Solución documentada.',
              dueOffsetDays: 8,
            },
          ],
          acceptanceCriteria: ['La solución cumple el alcance'],
          estimatedDurationDays: 8,
          conditions: ['Accesos disponibles'],
          assumptions: ['Información completa'],
          suggestedPrice: { amount: 1500, currency: 'PEN' },
        }),
      ),
    };
    const service = new AiEngineService(provider);

    const result = await service.generateProposalDraft({
      problem: 'Automatizar un proceso',
      requiredSkills: ['Node.js'],
      matchExplanation: ['Cobertura alta'],
      teamResponsibilities: [],
      userInstruction: 'Propón una solución en ocho días',
    });

    expect(result.deliverables).toHaveLength(2);
    expect(result.deliverables[1].dueOffsetDays).toBe(8);
    expect(result.estimatedDurationDays).toBe(8);
    expect(result.suggestedPrice).toEqual({ amount: 1500, currency: 'PEN' });
  });

  it('retries opportunity translations individually when a batch is truncated', async () => {
    const provider = {
      name: 'nvidia',
      generate: jest
        .fn()
        .mockResolvedValueOnce('{"items":[')
        .mockImplementation((prompt: string) => {
          const id = prompt.match(/"id":"([^"]+)"/)?.[1] ?? 'unknown';
          return Promise.resolve(
            JSON.stringify({
              items: [
                {
                  id,
                  title: `Título ${id}`,
                  summary: `Resumen ${id}`,
                },
              ],
            }),
          );
        }),
      analyze: jest.fn(),
    } as unknown as AiProvider;
    const service = new AiEngineService(provider);
    const opportunities = Array.from({ length: 4 }, (_, index) => ({
      id: `job-${index + 1}`,
      source: 'himalayas' as const,
      kind: 'remote_job' as const,
      title: `Job ${index + 1}`,
      summary: `Summary ${index + 1}`,
      organization: 'Example',
      skills: ['NestJS'],
      url: `https://example.com/jobs/${index + 1}`,
      publishedAt: new Date().toISOString(),
      matchScore: 80,
      translatedToSpanish: false,
    }));

    const translated =
      await service.translateOpportunitiesToSpanish(opportunities);

    expect(translated).toHaveLength(4);
    expect(translated.every((item) => item.translatedToSpanish)).toBe(true);
    expect(provider.generate).toHaveBeenCalledTimes(5);
  });

  it('asks exactly three AI-generated questions and evaluates the answers', async () => {
    const provider = {
      name: 'nvidia',
      generate: jest
        .fn()
        .mockResolvedValueOnce(
          JSON.stringify({
            capability: 'Desarrollo backend con NestJS',
            tags: ['NestJS', 'Backend'],
            questions: [
              {
                prompt: '¿Cómo organizarías módulos y dependencias?',
                options: [
                  'Por dominio',
                  'Todo junto',
                  'Sin módulos',
                  'Al azar',
                ],
              },
              {
                prompt: '¿Cómo diagnosticarías una API lenta?',
                options: [
                  'Con métricas',
                  'Reiniciando',
                  'Ignorándola',
                  'Cambiando todo',
                ],
              },
              {
                prompt: '¿Cómo validarías una decisión de arquitectura?',
                options: [
                  'Con pruebas',
                  'Por intuición',
                  'Sin medir',
                  'Sin revisión',
                ],
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            score: 84,
            suggestedLevel: 'advanced',
            strengths: ['Diagnóstico', 'Arquitectura modular'],
            improvementAreas: ['Observabilidad'],
            summary: 'Demuestra dominio aplicado de NestJS.',
          }),
        ),
      analyze: jest.fn(),
    } as unknown as AiProvider;
    const service = new AiEngineService(provider);
    const history: ConversationHistoryItem[] = [];

    const first = await service.analyzeConversation({
      conversationType: 'capability',
      message: 'Quiero ofrecer mi experiencia en desarrollo backend con NestJS',
      history,
    });
    expect(first.assistantReply).toContain('Pregunta 1 de 3');
    expect(first.quickReplies).toEqual([
      'Por dominio',
      'Todo junto',
      'Sin módulos',
      'Al azar',
    ]);
    expect(first.countdownSeconds).toBe(15);
    history.push(
      {
        role: 'user',
        text: 'Quiero ofrecer mi experiencia en desarrollo backend con NestJS',
      },
      {
        role: 'assistant',
        text: first.assistantReply,
        capabilityAssessment: first.capabilityAssessment,
      },
    );

    const second = await service.analyzeConversation({
      conversationType: 'capability',
      message: 'Por dominio',
      history,
    });
    expect(second.assistantReply).toContain('Pregunta 2 de 3');
    history.push(
      {
        role: 'user',
        text: 'Por dominio',
      },
      {
        role: 'assistant',
        text: second.assistantReply,
        capabilityAssessment: second.capabilityAssessment,
      },
    );

    const third = await service.analyzeConversation({
      conversationType: 'capability',
      message: 'Con métricas',
      history,
    });
    expect(third.assistantReply).toContain('Pregunta 3 de 3');
    history.push(
      {
        role: 'user',
        text: 'Con métricas',
      },
      {
        role: 'assistant',
        text: third.assistantReply,
        capabilityAssessment: third.capabilityAssessment,
      },
    );

    const evaluated = await service.analyzeConversation({
      conversationType: 'capability',
      message: 'Con pruebas',
      history,
    });
    expect(evaluated.assistantReply).toContain('Evaluación completada');
    expect(evaluated.capabilityAssessment?.result?.score).toBe(84);
    expect(evaluated.quickReplies).toEqual([
      'Sí, crear mi portafolio',
      'No, usaré un enlace propio',
    ]);
    expect(evaluated.missingFields).toEqual(['evidenceLinks']);
    history.push(
      {
        role: 'user',
        text: 'Con pruebas',
      },
      {
        role: 'assistant',
        text: evaluated.assistantReply,
        capabilityAssessment: evaluated.capabilityAssessment,
      },
    );

    const completed = await service.analyzeConversation({
      conversationType: 'capability',
      message: 'Mi evidencia está en https://example.com/portfolio',
      history,
    });
    expect(completed.missingFields).toEqual([]);
    expect(completed.extractedEntities).toMatchObject({
      proficiencyLevel: 'advanced',
      evidenceLinks: ['https://example.com/portfolio'],
      assessment: { score: 84, validationStatus: 'ai_assessed' },
    });
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it('marks a question as timed out and proceeds to the next one', async () => {
    const provider = {
      name: 'disabled',
      generate: jest.fn(),
      analyze: jest.fn(),
    } as unknown as AiProvider;
    const service = new AiEngineService(provider);
    const first = await service.analyzeConversation({
      conversationType: 'capability',
      message: 'Quiero ofrecer experiencia en soldadura industrial',
      history: [],
    });
    const second = await service.analyzeConversation({
      conversationType: 'capability',
      message: 'Tiempo agotado',
      history: [
        {
          role: 'assistant',
          text: first.assistantReply,
          capabilityAssessment: first.capabilityAssessment,
        },
      ],
    });
    expect(second.assistantReply).toContain('Pregunta 2 de 3');
    expect(second.capabilityAssessment?.answers[0]).toMatchObject({
      selectedOption: 'Tiempo agotado',
      timedOut: true,
    });
  });
});
