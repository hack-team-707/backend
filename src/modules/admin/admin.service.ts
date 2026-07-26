import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobStatus, ProblemStatus, UserRole } from '../../shared';
import { Problem } from '../problems/entities/problem.entity';
import { Project } from '../projects/entities/project.entity';
import { Rating } from '../reputation/entities/rating.entity';
import { PublicUser, toPublicUser, User } from '../users/entities/user.entity';
import { AuditService } from './audit.service';
import { UpdateUserRolesDto } from './dto/admin.dto';

export interface AdminMetrics {
  totals: {
    users: number;
    problems: number;
    projects: number;
    ratings: number;
  };
  usersByRole: Record<UserRole, number>;
  problemsByStatus: Record<ProblemStatus, number>;
  projectsByStatus: Record<JobStatus, number>;
  ratingsByScore: Record<string, number>;
}

const enumCounts = <T extends string>(
  values: readonly T[],
): Record<T, number> =>
  Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Problem)
    private readonly problems: Repository<Problem>,
    @InjectRepository(Project)
    private readonly projects: Repository<Project>,
    @InjectRepository(Rating)
    private readonly ratings: Repository<Rating>,
    private readonly audit: AuditService,
  ) {}

  async metrics(): Promise<AdminMetrics> {
    const [users, problems, projects, ratings] = await Promise.all([
      this.users.find(),
      this.problems.find(),
      this.projects.find(),
      this.ratings.find(),
    ]);
    const usersByRole = enumCounts(Object.values(UserRole));
    const problemsByStatus = enumCounts(Object.values(ProblemStatus));
    const projectsByStatus = enumCounts(Object.values(JobStatus));
    const ratingsByScore: Record<string, number> = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    };
    users.forEach((user) =>
      user.roles.forEach((role) => {
        usersByRole[role] += 1;
      }),
    );
    problems.forEach((problem) => {
      problemsByStatus[problem.status] += 1;
    });
    projects.forEach((project) => {
      projectsByStatus[project.status] += 1;
    });
    ratings.forEach((rating) => {
      const score = String(rating.score);
      ratingsByScore[score] = (ratingsByScore[score] ?? 0) + 1;
    });
    return {
      totals: {
        users: users.length,
        problems: problems.length,
        projects: projects.length,
        ratings: ratings.length,
      },
      usersByRole,
      problemsByStatus,
      projectsByStatus,
      ratingsByScore,
    };
  }

  async findUsers(): Promise<PublicUser[]> {
    const users = await this.users.find({ order: { createdAt: 'DESC' } });
    return users.map(toPublicUser);
  }

  async updateUserRoles(
    actorId: string,
    userId: string,
    dto: UpdateUserRolesDto,
  ): Promise<PublicUser> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('User not found');
    const removesOwnAdmin =
      actorId === userId &&
      user.roles.includes(UserRole.ADMIN) &&
      !dto.roles.includes(UserRole.ADMIN);
    if (removesOwnAdmin) {
      const users = await this.users.find();
      const adminCount = users.filter((candidate) =>
        candidate.roles.includes(UserRole.ADMIN),
      ).length;
      if (adminCount <= 1)
        throw new ConflictException('The last admin cannot remove their role');
    }
    const previousRoles = [...user.roles];
    this.users.merge(user, {
      roles: [...dto.roles],
      updatedAt: new Date().toISOString(),
    });
    const saved = await this.users.save(user);
    await this.audit.record({
      actor: actorId,
      action: 'admin.user.roles_updated',
      entity: 'user',
      entityId: userId,
      metadata: { previousRoles, newRoles: saved.roles },
    });
    return toPublicUser(saved);
  }

  capabilities() {
    return {
      aiConfiguration: { status: 'deferred', enabled: false },
      email: { status: 'deferred', enabled: false },
      push: { status: 'deferred', enabled: false },
      videoStorage: { status: 'deferred', enabled: false },
      advancedAnalytics: { status: 'deferred', enabled: false },
    } as const;
  }
}
