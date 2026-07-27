import { ExternalResultType } from '../enums/external-result-type.enum';
import { ProblemModality } from '../enums/problem-modality.enum';
import { TalentProviderName } from '../enums/talent-provider.enum';

export interface TalentSearchInput {
  problemId: string;
  title: string;
  description: string;
  category: string;
  requiredSkills: string[];
  modality: ProblemModality;
  language: string;
  city?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  limit?: number;
}

export interface ExternalTalentCandidate {
  provider: TalentProviderName;
  externalId: string;
  resultType: ExternalResultType;
  name: string;
  headline?: string;
  description?: string;
  skills: string[];
  rating?: number;
  reviewCount?: number;
  hourlyRate?: number;
  currency?: string;
  location?: {
    address?: string;
    city?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
    distanceMeters?: number;
  };
  profileUrl?: string;
  contactUrl?: string;
  websiteUrl?: string;
  phone?: string;
  availability: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
  compatibilityScore: number;
  compatibilityReasons: string[];
  missingSkills: string[];
  metadata?: Record<string, unknown>;
}

export interface TalentProvider {
  readonly providerName: TalentProviderName;
  readonly enabled: boolean;
  supports(input: TalentSearchInput): boolean;
  search(input: TalentSearchInput): Promise<ExternalTalentCandidate[]>;
  healthCheck(): Promise<{ available: boolean; message?: string }>;
}

export interface ExternalTalentSearchResponse {
  searchId?: string;
  problemId: string;
  internalCandidatesFound: number;
  fallbackActivated: boolean;
  modality: ProblemModality;
  aiGuidance: {
    summary: string;
    suggestedActions: string[];
    requiresProfessional: boolean;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    provider: string;
  };
  providersExecuted: TalentProviderName[];
  results: ExternalTalentCandidate[];
}
