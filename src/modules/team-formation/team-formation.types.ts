import { MatchStatus, TeamRole, TeamStatus } from '../../shared';

export interface TeamSuggestionMemberView {
  matchId: string;
  solverId: string;
  displayName: string;
  role: TeamRole;
  responsibilitySkills: string[];
  compatibility: number;
  reason: string;
  requestStatus: MatchStatus;
  requestedAt?: string;
}

export interface TeamSuggestionView {
  id: string;
  problemId: string;
  name: string;
  coverage: number;
  compatibility: number;
  availability: 'pending_confirmation';
  status: TeamStatus;
  leadSolverId: string;
  rationale: string[];
  missingSkills: string[];
  optionalAlternative: boolean;
  members: TeamSuggestionMemberView[];
}
