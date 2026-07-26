import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { LocationEncryptionService } from '../../common/location-encryption.service';
import {
  AiEngineService,
  IntentAnalysisResult,
} from '../ai-engine/ai-engine.service';
import { CreateProblemDto } from '../problems/dto/problem.dto';
import { ProblemsService } from '../problems/problems.service';
import { CapabilityPortfoliosService } from '../capability-portfolios/capability-portfolios.service';
import { MatchingService } from '../matching/matching.service';
import { NoMatchResolutionView } from '../matching/no-match-resolution.types';
import { OpportunitySearchService } from '../matching/opportunity-search.service';
import { CreateSkillCardDto } from '../skill-cards/dto/skill-card.dto';
import { SkillCardsService } from '../skill-cards/skill-cards.service';
import {
  CreateConversationDto,
  CreateMessageDto,
  MessageLocationDto,
} from './dto/conversation.dto';
import {
  Conversation,
  ConversationActionType,
  ConversationStatus,
  ConversationType,
  StructuredCard,
} from './entities/conversation.entity';
import { Message, MessageRole } from './entities/message.entity';

export interface ConversationTurnResult {
  userMessage: Message;
  assistantMessage: Message;
  conversation: Conversation;
}

export interface GuestConversationResult extends ConversationTurnResult {
  guestToken: string;
}

interface GuestConversationToken {
  sub: string;
  conversationId: string;
  purpose: 'guest-conversation';
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @InjectRepository(Conversation)
    private readonly conversations: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messages: Repository<Message>,
    private readonly problems: ProblemsService,
    private readonly skillCards: SkillCardsService,
    private readonly aiEngine: AiEngineService,
    private readonly capabilityPortfolios: CapabilityPortfoliosService,
    private readonly opportunitySearch: OpportunitySearchService,
    private readonly matching: MatchingService,
    private readonly jwtService: JwtService,
    @Optional()
    private readonly locationEncryption?: LocationEncryptionService,
  ) {}

  async createGuest(message: string): Promise<GuestConversationResult> {
    const guestOwnerId = `guest:${randomUUID()}`;
    const conversation = await this.create(guestOwnerId, {
      type: ConversationType.PROBLEM,
    });
    const turn = await this.addMessage(
      guestOwnerId,
      conversation.id,
      { text: message },
      `guest:${conversation.id}`,
    );
    const guestToken = await this.jwtService.signAsync(
      {
        sub: guestOwnerId,
        conversationId: conversation.id,
        purpose: 'guest-conversation',
      } satisfies GuestConversationToken,
      { expiresIn: '7d' },
    );
    return { ...turn, guestToken };
  }

  async claimGuest(ownerId: string, guestToken: string): Promise<Conversation> {
    const payload = await this.verifyGuestToken(guestToken);

    const claim = await this.conversations.update(
      { id: payload.conversationId, ownerId: payload.sub },
      { ownerId, updatedAt: new Date().toISOString() },
    );
    if (claim.affected === 1) {
      await this.messages.update(
        { conversationId: payload.conversationId, senderId: payload.sub },
        { senderId: ownerId },
      );
    }

    const conversation = await this.conversations.findOneBy({
      id: payload.conversationId,
    });
    if (!conversation) {
      throw new NotFoundException('Guest conversation was not found');
    }
    if (conversation.ownerId !== ownerId) {
      throw new ForbiddenException(
        'Guest conversation already belongs to another user',
      );
    }
    return conversation;
  }

  async discardGuest(guestToken: string): Promise<{ deleted: boolean }> {
    const payload = await this.verifyGuestToken(guestToken);
    const conversation = await this.conversations.findOneBy({
      id: payload.conversationId,
      ownerId: payload.sub,
    });
    if (!conversation) return { deleted: false };
    await this.messages.delete({ conversationId: payload.conversationId });
    const result = await this.conversations.delete({
      id: payload.conversationId,
      ownerId: payload.sub,
    });
    return { deleted: result.affected === 1 };
  }

  async create(
    ownerId: string,
    dto: CreateConversationDto,
  ): Promise<Conversation> {
    const now = new Date().toISOString();
    return this.conversations.save(
      this.conversations.create({
        id: randomUUID(),
        ownerId,
        type: dto.type,
        status: ConversationStatus.ACTIVE,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  findMine(ownerId: string): Promise<Conversation[]> {
    return this.conversations.find({
      where: { ownerId },
      order: { updatedAt: 'DESC' },
    });
  }

  async addMessage(
    ownerId: string,
    conversationId: string,
    dto: CreateMessageDto,
    idempotencyKey?: string,
  ): Promise<ConversationTurnResult> {
    const conversation = await this.owned(ownerId, conversationId);
    let resumedUserMessage: Message | undefined;
    if (idempotencyKey) {
      const existing = await this.messages.findOneBy({
        conversationId,
        idempotencyKey,
      });
      if (existing) {
        const assistant = await this.messages.findOneBy({
          conversationId,
          replyToMessageId: existing.id,
        });
        if (assistant) {
          if (conversation.status !== ConversationStatus.CONFIRMED) {
            const expectedStatus = assistant.structuredCard
              ? ConversationStatus.PENDING_CONFIRMATION
              : ConversationStatus.ACTIVE;
            if (
              conversation.status !== expectedStatus ||
              conversation.pendingCard !== assistant.structuredCard
            ) {
              this.conversations.merge(conversation, {
                status: expectedStatus,
                pendingCard: assistant.structuredCard ?? null,
                updatedAt: assistant.createdAt,
              });
              await this.conversations.save(conversation);
            }
          }
          return {
            userMessage: this.safeMessage(existing),
            assistantMessage: this.safeMessage(assistant),
            conversation,
          };
        }
        resumedUserMessage = existing;
      }
    }
    if (conversation.status === ConversationStatus.CONFIRMED) {
      throw new ConflictException('Conversation is already confirmed');
    }
    if (
      !dto.text?.trim() &&
      !dto.mediaUrls?.length &&
      !dto.structuredCard &&
      !dto.location
    ) {
      throw new BadRequestException('Message content is required');
    }

    const history = (
      await this.messages.find({
        where: { conversationId },
        order: { createdAt: 'ASC' },
        select: [
          'id',
          'conversationId',
          'senderId',
          'role',
          'replyToMessageId',
          'text',
          'mediaUrls',
          'structuredCard',
          'analysisMetadata',
          'idempotencyKey',
          'encryptedCoordinates',
          'approximateArea',
          'locationShared',
          'createdAt',
        ],
      })
    ).filter((message) => message.id !== resumedUserMessage?.id);
    const now = new Date().toISOString();
    const userMessage =
      resumedUserMessage ??
      (await this.messages.save(
        this.messages.create({
          id: randomUUID(),
          conversationId,
          senderId: ownerId,
          role: MessageRole.USER,
          ...(dto.text?.trim() ? { text: dto.text.trim() } : {}),
          mediaUrls: dto.mediaUrls ?? [],
          ...(dto.structuredCard ? { structuredCard: dto.structuredCard } : {}),
          ...(idempotencyKey ? { idempotencyKey } : {}),
          ...(dto.location
            ? {
                encryptedCoordinates: this.encryptLocation(dto.location),
                approximateArea: dto.location.approximateArea.trim(),
              }
            : {}),
          locationShared: Boolean(dto.location),
          createdAt: now,
        }),
      ));

    const analysis = dto.structuredCard
      ? this.manualCardAnalysis(conversation.type)
      : conversation.type === ConversationType.INQUIRY &&
          dto.text &&
          this.isOpportunitySearch(dto.text)
        ? await this.searchOpportunityAnalysis(ownerId, dto.text)
        : await this.aiEngine.analyzeConversation({
            conversationType: conversation.type,
            message: dto.text?.trim() ?? '',
            history: history.map((message) => ({
              role: message.role ?? MessageRole.USER,
              ...(message.text ? { text: message.text } : {}),
              ...(message.analysisMetadata?.capabilityAssessment
                ? {
                    capabilityAssessment:
                      message.analysisMetadata.capabilityAssessment,
                  }
                : {}),
            })),
          });
    if (
      analysis.extractedEntities.portfolioRequested === true &&
      analysis.capabilityAssessment
    ) {
      const generated = await this.capabilityPortfolios.createFromAssessment(
        ownerId,
        conversationId,
        analysis.capabilityAssessment,
      );
      analysis.capabilityAssessment = {
        ...analysis.capabilityAssessment,
        stage: 'complete',
        generatedPortfolio: {
          slug: generated.portfolio.slug,
          url: generated.url,
        },
      };
      analysis.extractedEntities.evidenceLinks = [generated.url];
      analysis.missingFields = [];
      analysis.assistantReply = `Tu portafolio de capacidad ya está disponible en ${generated.url}. Lo agregué como evidencia inicial de la Skill Card; revisa la vista previa y confirma cuando estés conforme.`;
    }
    const structuredCard = dto.structuredCard
      ? (dto.structuredCard as StructuredCard)
      : this.buildStructuredCard(conversation.type, analysis, dto, history);
    const assistantMessage = await this.messages.save(
      this.messages.create({
        id: randomUUID(),
        conversationId,
        senderId: 'resolve-assistant',
        role: MessageRole.ASSISTANT,
        replyToMessageId: userMessage.id,
        text: analysis.assistantReply,
        mediaUrls: [],
        ...(structuredCard ? { structuredCard } : {}),
        analysisMetadata: {
          intent: analysis.intent,
          confidence: analysis.confidence,
          missingFields: analysis.missingFields,
          provider: analysis.provider,
          ...(analysis.capabilityAssessment
            ? { capabilityAssessment: analysis.capabilityAssessment }
            : {}),
          ...(analysis.quickReplies
            ? { quickReplies: analysis.quickReplies }
            : {}),
          ...(analysis.countdownSeconds
            ? { countdownSeconds: analysis.countdownSeconds }
            : {}),
          ...(Array.isArray(analysis.extractedEntities.opportunities)
            ? {
                opportunities: analysis.extractedEntities.opportunities,
                opportunitySearch: {
                  query: String(
                    analysis.extractedEntities.opportunityQuery ?? '',
                  ),
                  strategy:
                    analysis.extractedEntities.opportunityStrategy ===
                    'internal_first'
                      ? ('internal_first' as const)
                      : ('external_fallback' as const),
                  sourcesConsulted: Array.isArray(
                    analysis.extractedEntities.sourcesConsulted,
                  )
                    ? analysis.extractedEntities.sourcesConsulted
                    : [],
                },
              }
            : {}),
        },
        locationShared: false,
        createdAt: new Date().toISOString(),
      }),
    );

    this.conversations.merge(conversation, {
      status: structuredCard
        ? ConversationStatus.PENDING_CONFIRMATION
        : ConversationStatus.ACTIVE,
      pendingCard: structuredCard ?? null,
      updatedAt: assistantMessage.createdAt,
    });
    await this.conversations.save(conversation);
    return {
      userMessage: this.safeMessage(userMessage),
      assistantMessage: this.safeMessage(assistantMessage),
      conversation,
    };
  }

  async getMessages(
    ownerId: string,
    conversationId: string,
  ): Promise<Message[]> {
    await this.owned(ownerId, conversationId);
    const messages = await this.messages.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
    return messages.map((message) => this.safeMessage(message));
  }

  async confirm(
    ownerId: string,
    conversationId: string,
  ): Promise<Conversation> {
    const conversation = await this.owned(ownerId, conversationId);
    if (conversation.status === ConversationStatus.CONFIRMED) {
      return conversation;
    }
    if (
      conversation.status !== ConversationStatus.PENDING_CONFIRMATION ||
      !conversation.pendingCard
    ) {
      throw new ConflictException(
        'Conversation has no action pending confirmation',
      );
    }
    const card = conversation.pendingCard;
    const claimedAt = new Date().toISOString();
    const claim = await this.conversations.update(
      {
        id: conversationId,
        ownerId,
        status: ConversationStatus.PENDING_CONFIRMATION,
      },
      { status: ConversationStatus.CONFIRMING, updatedAt: claimedAt },
    );
    if (claim.affected !== 1) {
      const current = await this.owned(ownerId, conversationId);
      if (current.status === ConversationStatus.CONFIRMED) return current;
      throw new ConflictException('Conversation confirmation is in progress');
    }
    conversation.status = ConversationStatus.CONFIRMING;
    conversation.updatedAt = claimedAt;
    let linkedEntityId: string;
    let confirmationText: string;
    let noMatchResolution: NoMatchResolutionView | undefined;
    try {
      if (card.actionType === ConversationActionType.PUBLISH_PROBLEM) {
        const dto = plainToInstance(CreateProblemDto, {
          ...card.payload,
          confirmed: true,
        });
        await this.assertValid(dto);
        const problem = await this.problems.createFromDto(ownerId, dto);
        linkedEntityId = problem.id;
        const requiredSkills = card.analysis?.requiredSkills ?? [];
        if (requiredSkills.length) {
          try {
            const matches = await this.matching.rank(ownerId, problem.id, {
              requiredSkills: requiredSkills.map((name) => ({
                skillId: name,
                name,
                weight: 1,
              })),
              limit: 20,
            });
            if (matches.length) {
              confirmationText = `Problema publicado correctamente. Encontré ${matches.length} persona${matches.length === 1 ? '' : 's'} con capacidades compatibles o similares. Puedes revisar el resultado en Mis problemas.`;
            } else {
              noMatchResolution = await this.matching.findNoMatchResolution(
                ownerId,
                problem.id,
              );
              confirmationText = `Problema publicado correctamente. ${noMatchResolution.message}`;
            }
          } catch (error) {
            this.logger.warn(
              `Automatic matching failed for problem ${problem.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
            );
            confirmationText =
              'Problema publicado correctamente, pero no se pudo completar la búsqueda de personas en este momento.';
          }
        } else {
          confirmationText =
            'Problema publicado correctamente. La IA no identificó capacidades suficientes para iniciar el matching automático.';
        }
      } else if (
        card.actionType === ConversationActionType.REGISTER_CAPABILITY
      ) {
        const dto = plainToInstance(CreateSkillCardDto, {
          ...card.payload,
          confirmed: true,
        });
        await this.assertValid(dto);
        linkedEntityId = (await this.skillCards.createFromDto(ownerId, dto)).id;
        confirmationText = 'Capacidad registrada correctamente.';
      } else {
        throw new BadRequestException('Unsupported confirmation action');
      }
    } catch (error) {
      await this.conversations.update(
        { id: conversationId, status: ConversationStatus.CONFIRMING },
        {
          status: ConversationStatus.PENDING_CONFIRMATION,
          updatedAt: new Date().toISOString(),
        },
      );
      throw error;
    }
    const now = new Date().toISOString();
    this.conversations.merge(conversation, {
      status: ConversationStatus.CONFIRMED,
      linkedEntityId,
      pendingCard: null,
      updatedAt: now,
    });
    const confirmed = await this.conversations.save(conversation);
    await this.messages.save(
      this.messages.create({
        id: randomUUID(),
        conversationId,
        senderId: 'resolve-system',
        role: MessageRole.SYSTEM,
        text: confirmationText,
        mediaUrls: [],
        ...(noMatchResolution
          ? {
              analysisMetadata: {
                intent: 'submit_problem' as const,
                confidence: 1,
                missingFields: [],
                provider: 'system',
                noMatchResolution,
              },
            }
          : {}),
        locationShared: false,
        createdAt: now,
      }),
    );
    return confirmed;
  }

  async reject(ownerId: string, conversationId: string): Promise<Conversation> {
    const conversation = await this.owned(ownerId, conversationId);
    if (
      conversation.status === ConversationStatus.ACTIVE &&
      !conversation.pendingCard
    ) {
      return conversation;
    }
    if (
      conversation.status !== ConversationStatus.PENDING_CONFIRMATION ||
      !conversation.pendingCard
    ) {
      throw new ConflictException(
        'Conversation has no action pending confirmation',
      );
    }
    const now = new Date().toISOString();
    this.conversations.merge(conversation, {
      status: ConversationStatus.ACTIVE,
      pendingCard: null,
      updatedAt: now,
    });
    const rejected = await this.conversations.save(conversation);
    await this.messages.save(
      this.messages.create({
        id: randomUUID(),
        conversationId,
        senderId: 'resolve-system',
        role: MessageRole.SYSTEM,
        text: 'Tarjeta descartada. Puedes continuar la conversación con nuevos datos.',
        mediaUrls: [],
        locationShared: false,
        createdAt: now,
      }),
    );
    return rejected;
  }

  private buildStructuredCard(
    type: ConversationType,
    analysis: IntentAnalysisResult,
    dto: CreateMessageDto,
    history: Message[],
  ): StructuredCard | undefined {
    if (analysis.missingFields.length) return undefined;
    if (type === ConversationType.PROBLEM) {
      const description = analysis.extractedEntities.description;
      if (typeof description !== 'string' || !description.trim())
        return undefined;
      const mediaUrls = [
        ...history.flatMap((message) => message.mediaUrls ?? []),
        ...(dto.mediaUrls ?? []),
      ];
      const previousLocation = [...history]
        .reverse()
        .find((message) => message.encryptedCoordinates)?.encryptedCoordinates;
      const geolocation = dto.location
        ? {
            latitude: dto.location.latitude,
            longitude: dto.location.longitude,
          }
        : previousLocation
          ? this.decryptLocation(previousLocation)
          : undefined;
      return {
        actionType: ConversationActionType.PUBLISH_PROBLEM,
        payload: {
          description: description.trim(),
          ...(mediaUrls.length
            ? { attachmentUrls: [...new Set(mediaUrls)] }
            : {}),
          ...(geolocation ? { geolocation } : {}),
        },
        ...(analysis.problemAnalysis
          ? {
              analysis: {
                category: analysis.problemAnalysis.category,
                urgencyLevel: analysis.problemAnalysis.urgencyLevel,
                requiredSkills: analysis.problemAnalysis.requiredSkills,
                summary: analysis.problemAnalysis.summary,
              },
            }
          : {}),
      };
    }
    if (type === ConversationType.CAPABILITY) {
      return {
        actionType: ConversationActionType.REGISTER_CAPABILITY,
        payload: {
          tags: analysis.extractedEntities.tags,
          proficiencyLevel: analysis.extractedEntities.proficiencyLevel,
          evidenceLinks: analysis.extractedEntities.evidenceLinks,
          assessment: analysis.extractedEntities.assessment,
        },
      };
    }
    return undefined;
  }

  private manualCardAnalysis(type: ConversationType): IntentAnalysisResult {
    return {
      intent:
        type === ConversationType.CAPABILITY
          ? 'register_skill'
          : 'submit_problem',
      confidence: 1,
      extractedEntities: {},
      missingFields: [],
      assistantReply:
        'Preparé la tarjeta solicitada. Revísala y confirma para ejecutar la acción.',
      provider: 'fallback',
    };
  }

  private async searchOpportunityAnalysis(
    ownerId: string,
    message: string,
  ): Promise<IntentAnalysisResult> {
    const result = await this.opportunitySearch.search(ownerId, message, 8);
    const count = result.opportunities.length;
    const internal = result.strategy === 'internal_first';
    const assistantReply = count
      ? internal
        ? `Encontré ${count} oportunidad${count === 1 ? '' : 'es'} compatible${count === 1 ? '' : 's'} dentro del marketplace de Resolve.`
        : `No encontré coincidencias internas activas. Consulté Himalayas y Freelancer y encontré ${count} oportunidad${count === 1 ? '' : 'es'} real${count === 1 ? '' : 'es'}; los textos se presentan en español y cada tarjeta conserva su fuente original.`
      : 'No encontré oportunidades internas ni publicaciones externas compatibles en este momento. Prueba con una tecnología, especialidad o función más concreta.';
    return {
      intent: 'general_question',
      confidence: count ? 0.96 : 0.8,
      extractedEntities: {
        opportunities: result.opportunities,
        opportunityQuery: result.query,
        opportunityStrategy: result.strategy,
        sourcesConsulted: result.sourcesConsulted,
      },
      missingFields: [],
      assistantReply,
      provider:
        this.aiEngine.providerName === 'disabled'
          ? 'fallback'
          : this.aiEngine.providerName,
    };
  }

  private isOpportunitySearch(message: string): boolean {
    return /\b(oportunidad(?:es)?|empleo(?:s)?|trabajo(?:s)?|vacante(?:s)?|proyecto(?:s)?\s+(?:freelance|remoto)|colaborador(?:es)?)\b/i.test(
      message,
    );
  }

  private async assertValid(value: object): Promise<void> {
    const errors = await validate(value, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length) {
      throw new BadRequestException(
        errors.flatMap((error) => Object.values(error.constraints ?? {})),
      );
    }
  }

  private encryptLocation(location: MessageLocationDto): string {
    if (!this.locationEncryption) {
      throw new Error('Location encryption service is unavailable');
    }
    return this.locationEncryption.encrypt({
      latitude: location.latitude,
      longitude: location.longitude,
    });
  }

  private decryptLocation(payload: string): {
    latitude: number;
    longitude: number;
  } {
    if (!this.locationEncryption) {
      throw new Error('Location encryption service is unavailable');
    }
    return this.locationEncryption.decrypt(payload);
  }

  private safeMessage(message: Message): Message {
    const safe = { ...message };
    delete safe.encryptedCoordinates;
    return safe;
  }

  private async verifyGuestToken(
    guestToken: string,
  ): Promise<GuestConversationToken> {
    let payload: GuestConversationToken;
    try {
      payload =
        await this.jwtService.verifyAsync<GuestConversationToken>(guestToken);
    } catch {
      throw new ForbiddenException('Guest conversation token is invalid');
    }
    if (
      payload.purpose !== 'guest-conversation' ||
      !payload.sub?.startsWith('guest:') ||
      !payload.conversationId
    ) {
      throw new ForbiddenException('Guest conversation token is invalid');
    }
    return payload;
  }

  private async owned(ownerId: string, id: string): Promise<Conversation> {
    const conversation = await this.conversations.findOneBy({ id });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.ownerId !== ownerId) {
      throw new ForbiddenException('Conversation is not owned by user');
    }
    return conversation;
  }
}
