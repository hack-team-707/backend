import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { JobStatus } from '../../shared';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import { SubmitRatingDto } from './dto/rating.dto';
import { Rating } from './entities/rating.entity';

export interface ReputationResult {
  userId: string;
  visible: boolean;
  ratingCount: number;
  projectCount: number;
  averageScore: number | null;
}

export interface UserRatingsResult extends ReputationResult {
  ratings: Rating[];
}

@Injectable()
export class ReputationService {
  private static readonly MINIMUM_PROJECTS = 3;

  constructor(
    @InjectRepository(Rating)
    private readonly ratings: Repository<Rating>,
    @InjectRepository(Project)
    private readonly projects: Repository<Project>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly notifications: NotificationsService,
  ) {}

  async submit(raterId: string, dto: SubmitRatingDto): Promise<Rating> {
    if (raterId === dto.rateeId)
      throw new ForbiddenException('Users cannot rate themselves');
    const project = await this.projects.findOneBy({ id: dto.projectId });
    if (!project) throw new NotFoundException('Project not found');
    if (project.status !== JobStatus.CLOSED)
      throw new ConflictException('Ratings require a closed project');
    if (
      !project.participantIds.includes(raterId) ||
      !project.participantIds.includes(dto.rateeId)
    ) {
      throw new ForbiddenException('Both users must be project participants');
    }
    const ratee = await this.users.findOneBy({ id: dto.rateeId });
    if (!ratee) throw new NotFoundException('Rated user not found');
    const existing = await this.ratings.findOneBy({
      projectId: dto.projectId,
      raterId,
      rateeId: dto.rateeId,
    });
    if (existing) throw new ConflictException('Rating already submitted');

    const rating = this.ratings.create({
      id: randomUUID(),
      projectId: dto.projectId,
      raterId,
      rateeId: dto.rateeId,
      score: dto.score,
      ...(dto.comment?.trim() ? { comment: dto.comment.trim() } : {}),
      createdAt: new Date().toISOString(),
    });
    try {
      const saved = await this.ratings.save(rating);
      await this.notifications.create({
        userId: dto.rateeId,
        type: NotificationType.RATING_RECEIVED,
        title: 'New rating received',
        message: 'A project participant rated your completed work.',
        href: `/projects/${dto.projectId}`,
      });
      return saved;
    } catch (error: unknown) {
      if (this.isDuplicateKey(error))
        throw new ConflictException('Rating already submitted');
      throw error;
    }
  }

  async getReputation(userId: string): Promise<ReputationResult> {
    const ratings = await this.getExistingUserRatings(userId);
    return this.summarize(userId, ratings);
  }

  async getUserRatings(userId: string): Promise<UserRatingsResult> {
    const ratings = await this.getExistingUserRatings(userId);
    const summary = this.summarize(userId, ratings);
    return {
      ...summary,
      ratings: summary.visible ? ratings : [],
    };
  }

  private async getExistingUserRatings(userId: string): Promise<Rating[]> {
    if (!(await this.users.findOneBy({ id: userId })))
      throw new NotFoundException('User not found');
    return this.ratings.find({
      where: { rateeId: userId },
      order: { createdAt: 'DESC' },
    });
  }

  private summarize(userId: string, ratings: Rating[]): ReputationResult {
    const projectCount = new Set(ratings.map((rating) => rating.projectId))
      .size;
    const visible = projectCount >= ReputationService.MINIMUM_PROJECTS;
    return {
      userId,
      visible,
      ratingCount: ratings.length,
      projectCount,
      averageScore:
        visible && ratings.length
          ? Number(
              (
                ratings.reduce((total, rating) => total + rating.score, 0) /
                ratings.length
              ).toFixed(2),
            )
          : null,
    };
  }

  private isDuplicateKey(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    );
  }
}
