import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { Problem } from '../problems/entities/problem.entity';
import { Match } from './entities/match.entity';
import {
  FederatedOpportunity,
  FederatedOpportunitySearchResult,
} from './opportunity-search.types';

interface HimalayasJob {
  guid?: string;
  title?: string;
  excerpt?: string;
  companyName?: string;
  employmentType?: string;
  minSalary?: number | null;
  maxSalary?: number | null;
  salaryPeriod?: string;
  currency?: string | null;
  locationRestrictions?: string[];
  categories?: string[];
  pubDate?: string | number;
  applicationLink?: string;
}

interface FreelancerProject {
  id?: number;
  title?: string;
  description?: string;
  seo_url?: string;
  submitdate?: number;
  currency?: { code?: string };
  budget?: { minimum?: number; maximum?: number };
  jobs?: Array<{ name?: string }>;
}

@Injectable()
export class OpportunitySearchService {
  private readonly logger = new Logger(OpportunitySearchService.name);

  constructor(
    @InjectRepository(Match) private readonly matches: Repository<Match>,
    @InjectRepository(Problem)
    private readonly problems: Repository<Problem>,
    private readonly aiEngine: AiEngineService,
    private readonly config: ConfigService,
  ) {}

  async search(
    solverId: string,
    query: string,
    limit = 8,
  ): Promise<FederatedOpportunitySearchResult> {
    const normalizedQuery = query.trim();
    const internal = await this.searchInternal(
      solverId,
      normalizedQuery,
      limit,
    );
    if (internal.length) {
      return {
        query: normalizedQuery,
        strategy: 'internal_first',
        opportunities: internal,
        sourcesConsulted: ['resolve'],
      };
    }

    if (!this.config.get<boolean>('EXTERNAL_OPPORTUNITIES_ENABLED', true)) {
      return {
        query: normalizedQuery,
        strategy: 'external_fallback',
        opportunities: [],
        sourcesConsulted: ['resolve'],
      };
    }

    const englishQuery =
      await this.aiEngine.translateOpportunityQueryToEnglish(normalizedQuery);
    const [himalayas, freelancer] = await Promise.all([
      this.searchHimalayas(englishQuery, limit),
      this.searchFreelancer(normalizedQuery, limit),
    ]);
    const external = [...himalayas, ...freelancer]
      .sort((left, right) =>
        String(right.publishedAt ?? '').localeCompare(
          String(left.publishedAt ?? ''),
        ),
      )
      .slice(0, limit);
    const localized =
      await this.aiEngine.translateOpportunitiesToSpanish(external);
    return {
      query: normalizedQuery,
      strategy: 'external_fallback',
      opportunities: localized,
      sourcesConsulted: ['resolve', 'himalayas', 'freelancer'],
    };
  }

  private async searchInternal(
    solverId: string,
    query: string,
    limit: number,
  ): Promise<FederatedOpportunity[]> {
    const matches = await this.matches.find({
      where: { solverId },
      order: { updatedAt: 'DESC' },
    });
    const terms = this.searchTerms(query);
    const relevant = matches.filter((match) => {
      if (!terms.length) return true;
      const searchable = [
        ...match.requiredSkills.flatMap((skill) => [skill.name, skill.skillId]),
        ...match.explanation,
      ]
        .join(' ')
        .toLowerCase();
      return terms.some((term) => searchable.includes(term));
    });
    return Promise.all(
      relevant.slice(0, limit).map(async (match) => {
        const problem = await this.problems.findOneBy({ id: match.problemId });
        return {
          id: `resolve:${match.id}`,
          source: 'resolve' as const,
          kind: 'internal_match' as const,
          title: problem?.description
            ? this.truncate(problem.description, 110)
            : `Oportunidad Resolve ${match.problemId.slice(0, 8)}`,
          summary:
            problem?.description ??
            match.explanation.join(' · ') ??
            'Oportunidad compatible con tus capacidades.',
          skills: match.requiredSkills.map((skill) => skill.name),
          url: '/opportunities',
          publishedAt: match.createdAt,
          matchScore: match.score,
          translatedToSpanish: false,
        };
      }),
    );
  }

  private async searchHimalayas(
    query: string,
    limit: number,
  ): Promise<FederatedOpportunity[]> {
    try {
      const url = new URL(this.config.getOrThrow<string>('HIMALAYAS_API_URL'));
      url.searchParams.set('q', query);
      url.searchParams.set('sort', 'recent');
      url.searchParams.set('page', '1');
      const body = await this.fetchJson<{ jobs?: HimalayasJob[] }>(url);
      return (body.jobs ?? []).slice(0, limit).flatMap((job) => {
        if (!job.title || !job.applicationLink) return [];
        return [
          {
            id: `himalayas:${job.guid ?? job.applicationLink}`,
            source: 'himalayas' as const,
            kind: 'remote_job' as const,
            title: job.title,
            summary:
              this.cleanText(job.excerpt) ||
              'Empleo remoto publicado en Himalayas.',
            ...(job.companyName ? { organization: job.companyName } : {}),
            skills: (job.categories ?? []).slice(0, 8),
            ...(job.locationRestrictions?.length
              ? { location: job.locationRestrictions.join(', ') }
              : { location: 'Remoto' }),
            ...(job.currency && (job.minSalary || job.maxSalary)
              ? {
                  budget: {
                    ...(job.minSalary ? { min: job.minSalary } : {}),
                    ...(job.maxSalary ? { max: job.maxSalary } : {}),
                    currency: job.currency,
                    ...(job.salaryPeriod ? { period: job.salaryPeriod } : {}),
                  },
                }
              : {}),
            url: job.applicationLink,
            ...(job.pubDate ? { publishedAt: this.isoDate(job.pubDate) } : {}),
            translatedToSpanish: false,
          },
        ];
      });
    } catch (error) {
      this.logExternalFailure('Himalayas', error);
      return [];
    }
  }

  private async searchFreelancer(
    query: string,
    limit: number,
  ): Promise<FederatedOpportunity[]> {
    try {
      const url = new URL(this.config.getOrThrow<string>('FREELANCER_API_URL'));
      url.searchParams.set('query', query);
      url.searchParams.set('limit', String(Math.min(limit, 20)));
      url.searchParams.set('full_description', 'true');
      url.searchParams.set('job_details', 'true');
      url.searchParams.set('sort_field', 'time_updated');
      url.searchParams.set('reverse_sort', 'true');
      const token = this.config.get<string>('FREELANCER_OAUTH_TOKEN');
      const body = await this.fetchJson<{
        result?: { projects?: FreelancerProject[] };
      }>(url, token ? { 'freelancer-oauth-v1': token } : undefined);
      return (body.result?.projects ?? []).flatMap((project) => {
        if (!project.id || !project.title || !project.seo_url) return [];
        return [
          {
            id: `freelancer:${project.id}`,
            source: 'freelancer' as const,
            kind: 'freelance_project' as const,
            title: project.title,
            summary:
              this.cleanText(project.description) ||
              'Proyecto publicado en Freelancer.',
            skills: (project.jobs ?? [])
              .map((job) => job.name?.trim())
              .filter((name): name is string => Boolean(name))
              .slice(0, 8),
            ...(project.budget && project.currency?.code
              ? {
                  budget: {
                    ...(project.budget.minimum !== undefined
                      ? { min: project.budget.minimum }
                      : {}),
                    ...(project.budget.maximum !== undefined
                      ? { max: project.budget.maximum }
                      : {}),
                    currency: project.currency.code,
                  },
                }
              : {}),
            url: `https://www.freelancer.com/projects/${project.seo_url}`,
            ...(project.submitdate
              ? {
                  publishedAt: new Date(
                    project.submitdate * 1000,
                  ).toISOString(),
                }
              : {}),
            translatedToSpanish: false,
          },
        ];
      });
    } catch (error) {
      this.logExternalFailure('Freelancer', error);
      return [];
    }
  }

  private async fetchJson<T>(
    url: URL,
    headers?: Record<string, string>,
  ): Promise<T> {
    const timeout = this.config.get<number>(
      'EXTERNAL_OPPORTUNITIES_TIMEOUT_MS',
      15000,
    );
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Resolve-Marketplace/1.0',
        ...headers,
      },
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) {
      throw new Error(`request failed with status ${response.status}`);
    }
    return (await response.json()) as T;
  }

  private searchTerms(query: string): string[] {
    const stopWords = new Set([
      'muestrame',
      'muéstrame',
      'oportunidades',
      'relacionadas',
      'con',
      'para',
      'buscar',
      'quiero',
      'trabajo',
      'empleo',
      'proyecto',
    ]);
    return query
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9+#.]+/)
      .filter((term) => term.length > 2 && !stopWords.has(term));
  }

  private cleanText(value?: string): string {
    return this.truncate(
      (value ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim(),
      220,
    );
  }

  private truncate(value: string, maxLength: number): string {
    return value.length <= maxLength
      ? value
      : `${value.slice(0, maxLength - 1).trim()}…`;
  }

  private isoDate(value: string | number): string {
    if (typeof value === 'number') {
      return new Date(
        value < 10_000_000_000 ? value * 1000 : value,
      ).toISOString();
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return new Date(
        numeric < 10_000_000_000 ? numeric * 1000 : numeric,
      ).toISOString();
    }
    return new Date(value).toISOString();
  }

  private logExternalFailure(source: string, error: unknown): void {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    this.logger.warn(`${source} opportunity search failed: ${reason}`);
  }
}
