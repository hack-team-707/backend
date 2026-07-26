export type OpportunitySource = 'resolve' | 'himalayas' | 'freelancer';
export type OpportunityKind =
  'internal_match' | 'remote_job' | 'freelance_project';

export interface FederatedOpportunity {
  id: string;
  source: OpportunitySource;
  kind: OpportunityKind;
  title: string;
  summary: string;
  organization?: string;
  skills: string[];
  location?: string;
  budget?: {
    min?: number;
    max?: number;
    currency: string;
    period?: string;
  };
  url: string;
  publishedAt?: string;
  matchScore?: number;
  translatedToSpanish: boolean;
}

export interface FederatedOpportunitySearchResult {
  query: string;
  strategy: 'internal_first' | 'external_fallback';
  opportunities: FederatedOpportunity[];
  sourcesConsulted: OpportunitySource[];
}
