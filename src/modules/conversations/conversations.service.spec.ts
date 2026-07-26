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
  } as unknown as MatchingService;
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
    jwt,
  );

  it('does not create a capability until explicit confirmation', async () => {
    const conversation = await service.create('owner', {
      type: ConversationType.CAPABILITY,
    });
    await service.addMessage('owner', conversation.id, {
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
  });

  it('starts matching compatible solvers after a problem is confirmed', async () => {
    matchingRank.mockResolvedValueOnce([
      { id: 'match-1', solverId: 'solver-1' },
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
