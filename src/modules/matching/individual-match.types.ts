import { MatchStatus } from '../../shared';

export interface IndividualMatchSuggestionView {
  id: string;
  problemId: string;
  solverId: string;
  displayName: string;
  coverage: number;
  compatibility: number;
  contributedSkills: string[];
  reason: string;
  availability: 'pending_confirmation';
  status: MatchStatus;
  requestedAt?: string;
}
