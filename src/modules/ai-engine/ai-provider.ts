import { ProficiencyLevel } from '../../shared';

export type AiProviderName =
  'disabled' | 'nvidia' | 'openai' | 'anthropic' | 'gemini';

export interface AiAnalysis {
  category: string;
  urgencyLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  requiredSkills: string[];
  summary: string;
}

export interface CapabilityAssessmentResult {
  score: number;
  suggestedLevel: ProficiencyLevel;
  strengths: string[];
  improvementAreas: string[];
  summary: string;
  validationStatus: 'ai_assessed';
}

export interface CapabilityAssessmentQuestion {
  prompt: string;
  options: [string, string, string, string];
}

export interface CapabilityAssessmentAnswer {
  questionIndex: number;
  selectedOption: string;
  answeredAt: string;
  timedOut: boolean;
}

export interface CapabilityAssessmentState {
  capability: string;
  tags: string[];
  questions: [
    CapabilityAssessmentQuestion,
    CapabilityAssessmentQuestion,
    CapabilityAssessmentQuestion,
  ];
  answers: CapabilityAssessmentAnswer[];
  stage: 'question' | 'evidence_choice' | 'external_evidence' | 'complete';
  currentQuestionStartedAt?: string;
  result?: CapabilityAssessmentResult;
  generatedPortfolio?: {
    slug: string;
    url: string;
  };
}

export interface AiProvider {
  readonly name: AiProviderName;
  generate(prompt: string): Promise<string>;
  analyze(prompt: string): Promise<AiAnalysis>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');

export function parseJsonObject(raw: string): Record<string, unknown> {
  const normalized = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const value = JSON.parse(normalized) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI provider did not return a JSON object');
  }
  return value as Record<string, unknown>;
}

export function parseAiAnalysis(raw: string): AiAnalysis {
  const value = parseJsonObject(raw) as Partial<AiAnalysis>;
  const urgency = value.urgencyLevel;
  if (
    typeof value.category !== 'string' ||
    !value.category.trim() ||
    !['Low', 'Medium', 'High', 'Critical'].includes(urgency ?? '') ||
    !Array.isArray(value.requiredSkills) ||
    !value.requiredSkills.every((skill) => typeof skill === 'string') ||
    typeof value.summary !== 'string'
  ) {
    throw new Error('AI provider returned an invalid analysis schema');
  }
  return {
    category: value.category.trim(),
    urgencyLevel: urgency as AiAnalysis['urgencyLevel'],
    requiredSkills: [
      ...new Set(
        value.requiredSkills.map((skill) => skill.trim()).filter(Boolean),
      ),
    ],
    summary: value.summary.trim(),
  };
}
