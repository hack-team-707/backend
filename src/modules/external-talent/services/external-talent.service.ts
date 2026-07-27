import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiEngineService } from '../../ai-engine/ai-engine.service';
import { SearchExternalTalentDto } from '../dto/search-external-talent.dto';
import { ExternalTalentResult } from '../entities/external-talent-result.entity';
import { ExternalTalentSearch } from '../entities/external-talent-search.entity';
import { EXTERNAL_TALENT_PROVIDERS } from '../external-talent.constants';
import {
  ExternalTalentCandidate,
  ExternalTalentSearchResponse,
  TalentProvider,
} from '../interfaces/talent-provider.interface';
import { ExternalTalentQueryBuilderService } from './external-talent-query-builder.service';
import { ExternalTalentRankingService } from './external-talent-ranking.service';

@Injectable()
export class ExternalTalentService {
  constructor(
    @InjectRepository(ExternalTalentSearch)
    private readonly searches: Repository<ExternalTalentSearch>,
    @InjectRepository(ExternalTalentResult)
    private readonly results: Repository<ExternalTalentResult>,
    @Inject(EXTERNAL_TALENT_PROVIDERS)
    private readonly providers: TalentProvider[],
    private readonly queryBuilder: ExternalTalentQueryBuilderService,
    private readonly ranking: ExternalTalentRankingService,
    private readonly aiEngine: AiEngineService,
  ) {}

  async search(
    requestedBy: string,
    dto: SearchExternalTalentDto,
  ): Promise<ExternalTalentSearchResponse> {
    const input = this.queryBuilder.build(dto);
    const guide = await this.aiEngine.generateNoMatchGuide(
      input.description,
      input.requiredSkills,
    );
    const guidance = {
      summary: guide.title,
      suggestedActions: guide.steps,
      requiresProfessional: true,
      riskLevel: guide.safetyWarnings.length
        ? ('HIGH' as const)
        : ('MEDIUM' as const),
      provider: guide.provider,
    };
    if (dto.internalCandidatesFound > 0) {
      return {
        problemId: dto.problemId,
        internalCandidatesFound: dto.internalCandidatesFound,
        fallbackActivated: false,
        modality: input.modality,
        aiGuidance: guidance,
        providersExecuted: [],
        results: [],
      };
    }

    const supported = this.providers.filter((provider) =>
      provider.supports(input),
    );
    const settled = await Promise.allSettled(
      supported.map((provider) => provider.search(input)),
    );
    const providersExecuted = supported.map(
      (provider) => provider.providerName,
    );
    const candidates = settled.flatMap((result) =>
      result.status === 'fulfilled' ? result.value : [],
    );
    const normalized = this.dedupe(candidates)
      .map((candidate) => this.ranking.rank(candidate, input.requiredSkills))
      .sort((a, b) => b.compatibilityScore - a.compatibilityScore)
      .slice(0, input.limit ?? 10);
    const search = await this.searches.save(
      this.searches.create({
        problemId: dto.problemId,
        requestedBy,
        modality: input.modality,
        query: input.requiredSkills.join(', ') || input.category || input.title,
        requiredSkills: input.requiredSkills,
        providersExecuted,
        status: 'completed',
        totalResults: normalized.length,
      }),
    );
    if (normalized.length) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
      await this.results.save(
        normalized.map((candidate) =>
          this.results.create({
            searchId: search.id,
            ...candidate,
            location: candidate.location,
            expiresAt,
          }),
        ),
      );
    }
    return {
      searchId: search.id,
      problemId: dto.problemId,
      internalCandidatesFound: 0,
      fallbackActivated: true,
      modality: input.modality,
      aiGuidance: guidance,
      providersExecuted,
      results: normalized,
    };
  }

  async findSearch(
    requestedBy: string,
    id: string,
  ): Promise<ExternalTalentSearchResponse> {
    const search = await this.searches.findOne({
      where: { id },
      relations: { results: true },
    });
    if (!search)
      throw new NotFoundException('External talent search not found');
    if (search.requestedBy !== requestedBy)
      throw new ForbiddenException('External talent search is private');
    return this.toResponse(search);
  }

  async findForProblem(
    requestedBy: string,
    problemId: string,
  ): Promise<ExternalTalentSearchResponse[]> {
    const searches = await this.searches.find({
      where: { problemId, requestedBy },
      relations: { results: true },
      order: { createdAt: 'DESC' },
    });
    return searches.map((search) => this.toResponse(search));
  }

  async providerHealth(): Promise<
    Array<{ provider: string; available: boolean; message?: string }>
  > {
    return Promise.all(
      this.providers.map(async (provider) => ({
        provider: provider.providerName,
        ...(await provider.healthCheck()),
      })),
    );
  }

  private toResponse(
    search: ExternalTalentSearch,
  ): ExternalTalentSearchResponse {
    return {
      searchId: search.id,
      problemId: search.problemId,
      internalCandidatesFound: 0,
      fallbackActivated: true,
      modality: search.modality,
      aiGuidance: {
        summary: 'Orientación inicial disponible en la conversación original.',
        suggestedActions: [],
        requiresProfessional: true,
        riskLevel: 'MEDIUM',
        provider: 'persisted',
      },
      providersExecuted: search.providersExecuted,
      results: (search.results ?? []).map((result) => ({
        provider: result.provider,
        externalId: result.externalId,
        resultType: result.resultType,
        name: result.name,
        headline: result.headline,
        description: result.description,
        skills: result.skills,
        rating: result.rating,
        reviewCount: result.reviewCount,
        hourlyRate: result.hourlyRate,
        currency: result.currency,
        location: result.location,
        profileUrl: result.profileUrl,
        contactUrl: result.contactUrl,
        websiteUrl: result.websiteUrl,
        phone: result.phone,
        availability: 'UNKNOWN',
        compatibilityScore: result.compatibilityScore,
        compatibilityReasons: result.compatibilityReasons,
        missingSkills: result.missingSkills,
        metadata: result.metadata,
      })) as ExternalTalentCandidate[],
    };
  }

  private dedupe(
    candidates: ExternalTalentCandidate[],
  ): ExternalTalentCandidate[] {
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      const key = `${candidate.provider}:${candidate.externalId || candidate.profileUrl || candidate.name.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
