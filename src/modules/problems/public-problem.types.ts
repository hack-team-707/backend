import { ProblemStatus } from '../../shared';

export interface PublicProblemOwner {
  id: string;
  displayName: string;
}

export interface PublicProblemSkill {
  skillId: string;
  name: string;
}

export interface PublicProblemView {
  id: string;
  description: string;
  status: ProblemStatus;
  owner: PublicProblemOwner;
  requiredSkills: PublicProblemSkill[];
  mediaCount: number;
  hasApproximateLocation: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicProblemIndexItem {
  id: string;
  description: string;
  updatedAt: string;
}
