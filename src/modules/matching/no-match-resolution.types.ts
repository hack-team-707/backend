export type ExternalRecommendationKind =
  'platform' | 'professional_directory' | 'community';

export interface ExternalChannelRecommendation {
  id: string;
  name: string;
  kind: ExternalRecommendationKind;
  description: string;
  reason: string;
  url: string;
  source: 'predefined_rule';
}

export interface NoMatchAiGuide {
  title: string;
  steps: string[];
  safetyWarnings: string[];
  disclaimer: string;
  provider: string;
}

export interface NoMatchResolutionView {
  id: string;
  problemId: string;
  minimumCoverage: number;
  bestCoverage: number;
  requiredSkills: string[];
  message: string;
  recommendations: ExternalChannelRecommendation[];
  aiGuide?: NoMatchAiGuide | null;
  createdAt: string;
  updatedAt: string;
}
