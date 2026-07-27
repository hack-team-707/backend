import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { lastValueFrom } from 'rxjs';
import { GOOGLE_PLACES_FIELD_MASK } from '../external-talent.constants';
import { ProblemModality } from '../enums/problem-modality.enum';
import { TalentProviderName } from '../enums/talent-provider.enum';
import {
  ExternalTalentCandidate,
  TalentProvider,
  TalentSearchInput,
} from '../interfaces/talent-provider.interface';
import { GooglePlacesMapper } from '../mappers/google-places.mapper';
import { ExternalTalentQueryBuilderService } from '../services/external-talent-query-builder.service';

@Injectable()
export class GooglePlacesProvider implements TalentProvider {
  readonly providerName = TalentProviderName.GOOGLE_PLACES;
  readonly enabled: boolean;
  private readonly logger = new Logger(GooglePlacesProvider.name);
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: ExternalTalentCandidate[] }
  >();

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly mapper: GooglePlacesMapper,
    private readonly queryBuilder: ExternalTalentQueryBuilderService,
  ) {
    this.enabled = this.config.get<boolean>('GOOGLE_PLACES_ENABLED') ?? false;
  }

  supports(input: TalentSearchInput): boolean {
    return (
      this.enabled &&
      (input.modality === ProblemModality.LOCAL ||
        input.modality === ProblemModality.HYBRID)
    );
  }

  async search(input: TalentSearchInput): Promise<ExternalTalentCandidate[]> {
    if (!this.supports(input)) return [];
    const textQuery = this.queryBuilder.googleQuery(input);
    const cacheKey = JSON.stringify([
      textQuery,
      input.latitude,
      input.longitude,
      input.radiusMeters,
      input.limit,
    ]);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const startedAt = Date.now();
    const correlationId = randomUUID();
    try {
      const baseUrl = this.config
        .get<string>(
          'GOOGLE_PLACES_BASE_URL',
          'https://places.googleapis.com/v1',
        )
        .replace(/\/$/, '');
      const body: Record<string, unknown> = {
        textQuery,
        languageCode:
          input.language ||
          this.config.get<string>('GOOGLE_PLACES_LANGUAGE', 'es'),
        regionCode:
          input.countryCode ||
          this.config.get<string>('GOOGLE_PLACES_REGION', 'PE'),
        pageSize: Math.min(input.limit ?? 10, 20),
        includePureServiceAreaBusinesses: true,
      };
      if (
        typeof input.latitude === 'number' &&
        typeof input.longitude === 'number'
      ) {
        body.locationBias = {
          circle: {
            center: {
              latitude: input.latitude,
              longitude: input.longitude,
            },
            radius:
              input.radiusMeters ??
              this.config.get<number>(
                'GOOGLE_PLACES_DEFAULT_RADIUS_METERS',
                10000,
              ),
          },
        };
      }
      const response = await lastValueFrom(
        this.http.post(`${baseUrl}/places:searchText`, body, {
          timeout: this.config.get<number>('GOOGLE_PLACES_TIMEOUT_MS', 8000),
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.config.getOrThrow<string>(
              'GOOGLE_PLACES_API_KEY',
            ),
            'X-Goog-FieldMask': GOOGLE_PLACES_FIELD_MASK,
          },
        }),
      );
      const value = this.mapper.map(response.data);
      this.cache.set(cacheKey, {
        expiresAt: Date.now() + 5 * 60_000,
        value,
      });
      return value;
    } catch (error) {
      this.logger.error(
        `provider=${this.providerName} correlationId=${correlationId} durationMs=${Date.now() - startedAt} status=${this.status(error)} message=${error instanceof Error ? error.message : 'unknown'}`,
      );
      return [];
    }
  }

  async healthCheck(): Promise<{ available: boolean; message?: string }> {
    if (!this.enabled)
      return { available: false, message: 'Proveedor desactivado' };
    return this.config.get<string>('GOOGLE_PLACES_API_KEY')
      ? { available: true, message: 'Configurado' }
      : { available: false, message: 'API key no configurada' };
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
