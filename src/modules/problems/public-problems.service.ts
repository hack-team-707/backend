import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ProblemStatus } from '../../shared';
import { Match } from '../matching/entities/match.entity';
import { NoMatchResolution } from '../matching/entities/no-match-resolution.entity';
import { User } from '../users/entities/user.entity';
import { Problem } from './entities/problem.entity';
import {
  PublicProblemIndexItem,
  PublicProblemView,
} from './public-problem.types';

const PUBLIC_STATUSES = [
  ProblemStatus.PUBLISHED,
  ProblemStatus.ANALYZING,
  ProblemStatus.MATCHING,
  ProblemStatus.TEAM_SUGGESTED,
  ProblemStatus.PROPOSAL_SENT,
  ProblemStatus.IN_EXECUTION,
  ProblemStatus.IN_VALIDATION,
  ProblemStatus.RESOLVED,
  ProblemStatus.UNRESOLVED,
];

@Injectable()
export class PublicProblemsService {
  constructor(
    @InjectRepository(Problem)
    private readonly problems: Repository<Problem>,
    @InjectRepository(Match)
    private readonly matches: Repository<Match>,
    @InjectRepository(NoMatchResolution)
    private readonly noMatchResolutions: Repository<NoMatchResolution>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async findIndex(): Promise<PublicProblemIndexItem[]> {
    const problems = await this.problems.find({
      where: { status: In(PUBLIC_STATUSES) },
      order: { updatedAt: 'DESC' },
      take: 1000,
    });
    return problems.map(({ id, description, updatedAt }) => ({
      id,
      description:
        description?.trim() ||
        'Problema publicado mediante contenido multimedia',
      updatedAt,
    }));
  }

  async findOne(id: string): Promise<PublicProblemView> {
    const problem = await this.problems.findOneBy({ id });
    if (!problem || !PUBLIC_STATUSES.includes(problem.status)) {
      throw new NotFoundException('Public problem not found');
    }

    const [owner, matches, noMatchResolution] = await Promise.all([
      this.users.findOneBy({ id: problem.ownerId }),
      this.matches.find({
        where: { problemId: problem.id },
        order: { score: 'DESC' },
        take: 1,
      }),
      this.noMatchResolutions.findOneBy({ problemId: problem.id }),
    ]);
    if (!owner) throw new NotFoundException('Problem owner not found');

    const requiredSkills = matches[0]?.requiredSkills?.length
      ? matches[0].requiredSkills.map(({ skillId, name }) => ({
          skillId,
          name,
        }))
      : (noMatchResolution?.requiredSkills ?? []).map((name) => ({
          skillId: this.skillId(name),
          name,
        }));
    return {
      id: problem.id,
      description:
        problem.description?.trim() ||
        'Problema publicado mediante contenido multimedia',
      status: problem.status,
      owner: {
        id: owner.id,
        displayName: owner.displayName,
      },
      requiredSkills,
      mediaCount:
        problem.imageUrls.length +
        problem.attachmentUrls.length +
        (problem.audioUrl ? 1 : 0),
      hasApproximateLocation: problem.hasGeolocation,
      createdAt: problem.createdAt,
      updatedAt: problem.updatedAt,
    };
  }

  private skillId(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
