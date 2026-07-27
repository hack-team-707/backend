import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { lastValueFrom } from 'rxjs';
import { TalentProviderName } from '../enums/talent-provider.enum';
import { ProblemModality } from '../enums/problem-modality.enum';
import {
  ExternalTalentCandidate,
  TalentProvider,
  TalentSearchInput,
} from '../interfaces/talent-provider.interface';
import { FreelancerTalentMapper } from '../mappers/freelancer-talent.mapper';
import { ExternalTalentQueryBuilderService } from '../services/external-talent-query-builder.service';

@Injectable()
export class FreelancerTalentProvider implements TalentProvider {
  readonly providerName = TalentProviderName.FREELANCER;
  readonly enabled: boolean;
  private readonly logger = new Logger(FreelancerTalentProvider.name);
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: ExternalTalentCandidate[] }
  >();
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly mapper: FreelancerTalentMapper,
    private readonly queryBuilder: ExternalTalentQueryBuilderService,
  ) {
    this.enabled = this.config.get<boolean>('FREELANCER_ENABLED') ?? true;
  }

  supports(input: TalentSearchInput): boolean {
    return (
      this.enabled &&
      (input.modality === ProblemModality.REMOTE ||
        input.modality === ProblemModality.HYBRID)
    );
  }

  async search(input: TalentSearchInput): Promise<ExternalTalentCandidate[]> {
    if (!this.supports(input) || Date.now() < this.circuitOpenUntil) return [];
    const query = this.queryBuilder.freelancerQuery(input);
    const cacheKey = JSON.stringify(['global', query, input.limit]);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const startedAt = Date.now();
    const correlationId = randomUUID();
    try {
      const baseUrl = this.config
        .get<string>('FREELANCER_BASE_URL', 'https://www.freelancer.com')
        .replace(/\/$/, '');
      const token = this.config.get<string>('FREELANCER_OAUTH_TOKEN');
      const response = await this.requestWithRetry(
        `${baseUrl}/api/users/0.1/users/directory`,
        token ? { Authorization: `Bearer ${token}` } : {},
        {
          query,
          compact: false,
          profile_description: true,
          reputation: true,
          limit: Math.min(input.limit ?? 10, 20),
        },
      );
      const value = this.mapper.map(response);
      this.cache.set(cacheKey, {
        expiresAt: Date.now() + 20 * 60_000,
        value,
      });
      this.consecutiveFailures = 0;
      return value;
    } catch (error) {
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= 3) {
        this.circuitOpenUntil = Date.now() + 60_000;
      }
      this.logger.error(
        `provider=${this.providerName} correlationId=${correlationId} durationMs=${Date.now() - startedAt} status=${this.status(error)} message=${error instanceof Error ? error.message : 'unknown'}`,
      );
      return [];
    }
  }

  async healthCheck(): Promise<{ available: boolean; message?: string }> {
    if (!this.enabled)
      return { available: false, message: 'Proveedor desactivado' };
    return {
      available: Date.now() >= this.circuitOpenUntil,
      message:
        Date.now() < this.circuitOpenUntil
          ? 'Circuito temporalmente abierto'
          : this.config.get<string>('FREELANCER_OAUTH_TOKEN')
            ? 'Directorio público con OAuth configurado'
            : 'Directorio público configurado',
    };
  }

  private async requestWithRetry(
    url: string,
    headers: Record<string, string>,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const timeout = this.config.get<number>('FREELANCER_TIMEOUT_MS', 8000);
    try {
      return (
        await lastValueFrom(this.http.get(url, { headers, params, timeout }))
      ).data;
    } catch (error) {
      const status = this.status(error);
      if (status >= 500 || status === 0) {
        return (
          await lastValueFrom(this.http.get(url, { headers, params, timeout }))
        ).data;
      }
      throw error;
    }
  }

  private status(error: unknown): number {
    if (
      error &&
      typeof error === 'object' &&
      'response' in error &&
      error.response &&
      typeof error.response === 'object' &&
      'status' in error.response
    ) {
      return Number(error.response.status) || 0;
    }
    return 0;
  }
}
