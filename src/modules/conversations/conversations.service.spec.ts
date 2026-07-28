import { ProficiencyLevel } from '../../shared';
import { JwtService } from '@nestjs/jwt';
import { createMockRepository } from '../../test-utils/typeorm-repository.mock';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { CapabilityPortfoliosService } from '../capability-portfolios/capability-portfolios.service';
import { MatchingService } from '../matching/matching.service';
import { OpportunitySearchService } from '../matching/opportunity-search.service';
import { Problem } from '../problems/entities/problem.entity';
import { ProblemsService } from '../problems/problems.service';
import { SkillCard } from '../skill-cards/entities/skill-card.entity';
import { SkillCardsService } from '../skill-cards/skill-cards.service';
import { TeamFormationService } from '../team-formation/team-formation.service';
import {
  Conversation,
  ConversationActionType,
  ConversationStatus,
  ConversationType,
} from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { ConversationsService } from './conversations.service';

describe('ConversationsService', () => {
  const skills = new SkillCardsService(createMockRepository<SkillCard>());
  const jwt = {
    signAsync: jest.fn().mockResolvedValue('signed-guest-token'),
    verifyAsync: jest.fn(),
  } as unknown as JwtService;
  const matchingRank = jest.fn().mockResolvedValue([]);
  const matching = {
    rank: matchingRank,
    toSuggestions: jest.fn().mockImplementation(async (matches) =>
      matches.map(
        (match: { id: string; solverId: string; coverage: number }) => ({
          id: match.id,
          problemId: 'problem-1',
          solverId: match.solverId,
          displayName: 'Solucionador compatible',
          coverage: match.coverage,
          compatibility: 90,
          contributedSkills: ['Diagnóstico de hardware'],
          reason: 'Cobertura compatible.',
          availability: 'pending_confirmation',
          status: 'suggested',
        }),
      ),
    ),
    findForProblem: jest.fn().mockResolvedValue([]),
    clearNoMatchResolution: jest.fn().mockResolvedValue(undefined),
  } as unknown as MatchingService;
  const teamFormation = {
    form: jest.fn(),
    toSuggestion: jest.fn(),
    findSuggestionForProblem: jest.fn().mockResolvedValue(undefined),
  } as unknown as TeamFormationService;
  const service = new ConversationsService(
    createMockRepository<Conversation>(),
    createMockRepository<Message>(),
    new ProblemsService(createMockRepository<Problem>()),
    skills,
    {
      analyzeConversation: jest.fn(),
    } as unknown as AiEngineService,
    {
      createFromAssessment: jest.fn(),
    } as unknown as CapabilityPortfoliosService,
    {
      search: jest.fn(),
    } as unknown as OpportunitySearchService,
    matching,
    teamFormation,
    jwt,
  );

  it('does not create a capability until explicit confirmation', async () => {
    const conversation = await service.create('owner', {
      type: ConversationType.CAPABILITY,
    });
    await service.addMessage('owner', conversation.id, {
      text: 'Quiero registrar mi experiencia en instalaciones eléctricas.',
      structuredCard: {
        actionType: ConversationActionType.REGISTER_CAPABILITY,
        payload: {
          proficiencyLevel: ProficiencyLevel.ADVANCED,
          tags: ['electrical'],
          evidenceLinks: [
            'http://localhost:3001/portfolio/electrical-assessment',
          ],
        },
      },
    });
    expect(await skills.findMine('owner')).toHaveLength(0);
    const confirmed = await service.confirm('owner', conversation.id);
    expect(confirmed.status).toBe(ConversationStatus.CONFIRMED);
    expect(await skills.findMine('owner')).toHaveLength(1);
    const [historyItem] = await service.findMine('owner');
    expect(historyItem.requestPreview).toBe(
      'Quiero registrar mi experiencia en instalaciones eléctricas.',
    );
    expect(historyItem.resultPreview).toBe(
      'Capacidad registrada correctamente.',
    );
  });

  it('starts matching compatible solvers after a problem is confirmed', async () => {
    matchingRank.mockResolvedValueOnce([
      { id: 'match-1', solverId: 'solver-1', coverage: 100 },
    ]);
    const conversation = await service.create('requester', {
      type: ConversationType.PROBLEM,
    });
    await service.addMessage('requester', conversation.id, {
      structuredCard: {
        actionType: ConversationActionType.PUBLISH_PROBLEM,
        payload: {
          description:
            'Mi computadora se apaga y necesito diagnosticar el hardware.',
        },
        analysis: {
          category: 'Soporte técnico',
          urgencyLevel: 'Medium',
          requiredSkills: ['Diagnóstico de hardware'],
          summary: 'Se necesita revisar el equipo.',
        },
      },
    } as never);

    const confirmed = await service.confirm('requester', conversation.id);
    const messages = await service.getMessages('requester', conversation.id);

    expect(confirmed.status).toBe(ConversationStatus.CONFIRMED);
    expect(matchingRank).toHaveBeenCalledWith(
      'requester',
      confirmed.linkedEntityId,
      expect.objectContaining({
        requiredSkills: [
          {
            skillId: 'Diagnóstico de hardware',
            name: 'Diagnóstico de hardware',
            weight: 1,
          },
        ],
      }),
    );
    expect(messages.at(-1)?.text).toContain('Encontré 1 persona');
  });

  it('keeps individual choices and exposes an optional team when one solver covers every skill', async () => {
    matchingRank.mockResolvedValueOnce([
      { id: 'match-1', solverId: 'solver-1', coverage: 100 },
      { id: 'match-2', solverId: 'solver-2', coverage: 50 },
    ]);
    const team = {
      id: 'team-1',
      problemId: 'problem-1',
      members: [],
    };
    const suggestion = {
      id: 'team-1',
      problemId: 'problem-1',
      name: 'Equipo complementario recomendado',
      coverage: 100,
      compatibility: 74,
      availability: 'pending_confirmation',
      status: 'suggested',
      leadSolverId: 'solver-1',
      rationale: ['Cobertura complementaria completa.'],
      optionalAlternative: true,
      members: [
        {
          solverId: 'solver-1',
          displayName: 'Ana React',
          role: 'lead',
          responsibilitySkills: ['react', 'javascript'],
          compatibility: 76,
          reason: 'Aporta React y JavaScript.',
        },
        {
          solverId: 'solver-2',
          displayName: 'Luis Web',
          role: 'member',
          responsibilitySkills: ['desarrollo web'],
          compatibility: 72,
          reason: 'Aporta desarrollo web.',
        },
      ],
    };
    (teamFormation.form as jest.Mock).mockResolvedValueOnce(team);
    (teamFormation.toSuggestion as jest.Mock).mockResolvedValueOnce(suggestion);
    const refreshedSuggestion = {
      ...suggestion,
      members: suggestion.members.map((member, index) => ({
        ...member,
        matchId: `match-${index + 1}`,
        requestStatus: 'suggested',
      })),
    };
    (teamFormation.findSuggestionForProblem as jest.Mock).mockResolvedValueOnce(
      refreshedSuggestion,
    );
    (matching.findForProblem as jest.Mock).mockResolvedValueOnce([
      { id: 'match-1', solverId: 'solver-1', coverage: 100 },
      { id: 'match-2', solverId: 'solver-2', coverage: 50 },
    ]);

    const conversation = await service.create('team-requester', {
      type: ConversationType.PROBLEM,
    });
    await service.addMessage('team-requester', conversation.id, {
      structuredCard: {
        actionType: ConversationActionType.PUBLISH_PROBLEM,
        payload: {
          description: 'Necesito corregir una aplicación React.',
        },
        analysis: {
          category: 'Tecnología',
          urgencyLevel: 'Medium',
          requiredSkills: ['React', 'JavaScript', 'Desarrollo web'],
          summary: 'Corrección de aplicación React.',
        },
      },
    } as never);

    const confirmed = await service.confirm('team-requester', conversation.id);
    const messages = await service.getMessages(
      'team-requester',
      conversation.id,
    );

    expect(teamFormation.form).toHaveBeenCalledWith(
      'team-requester',
      confirmed.linkedEntityId,
    );
    expect(messages.at(-1)?.text).toContain('alternativa de equipo');
    expect(
      messages.at(-1)?.analysisMetadata?.individualSuggestions,
    ).toHaveLength(2);
    expect(messages.at(-1)?.analysisMetadata?.teamSuggestion).toEqual(
      refreshedSuggestion,
    );
  });

  it('preserves an AI guest conversation when an authenticated user claims it', async () => {
    const aiEngine = {
      analyzeConversation: jest.fn().mockResolvedValue({
        intent: 'submit_problem',
        confidence: 0.95,
        extractedEntities: {
          description:
            'El sistema de inventario descuenta dos veces cada producto vendido.',
          category: 'Software',
          urgencyLevel: 'High',
          requiredSkills: ['Backend', 'Bases de datos'],
        },
        missingFields: [],
        assistantReply:
          'El inventario tiene una inconsistencia. Se recomienda backend y bases de datos.',
        problemAnalysis: {
          category: 'Software',
          urgencyLevel: 'High',
          requiredSkills: ['Backend', 'Bases de datos'],
          summary: 'El inventario tiene una inconsistencia.',
        },
        provider: 'nvidia',
      }),
    } as unknown as AiEngineService;
    const guestJwt = {
      signAsync: jest.fn().mockResolvedValue('guest-token'),
      verifyAsync: jest.fn(),
    } as unknown as JwtService;
    const guestService = new ConversationsService(
      createMockRepository<Conversation>(),
      createMockRepository<Message>(),
      new ProblemsService(createMockRepository<Problem>()),
      new SkillCardsService(createMockRepository<SkillCard>()),
      aiEngine,
      {
        createFromAssessment: jest.fn(),
      } as unknown as CapabilityPortfoliosService,
      {
        search: jest.fn(),
      } as unknown as OpportunitySearchService,
      {
        rank: jest.fn(),
      } as unknown as MatchingService,
      teamFormation,
      guestJwt,
    );

    const guest = await guestService.createGuest(
      'El sistema de inventario descuenta dos veces cada producto vendido.',
    );
    const signedPayload = (
      guestJwt.signAsync as jest.MockedFunction<JwtService['signAsync']>
    ).mock.calls[0][0] as {
      sub: string;
      conversationId: string;
      purpose: string;
    };
    (
      guestJwt.verifyAsync as jest.MockedFunction<JwtService['verifyAsync']>
    ).mockResolvedValue(signedPayload);

    const claimed = await guestService.claimGuest('registered-user', 'token');
    expect(claimed.id).toBe(guest.conversation.id);
    expect(claimed.ownerId).toBe('registered-user');
    await expect(
      guestService.getMessages('registered-user', claimed.id),
    ).resolves.toHaveLength(2);
  });
});
