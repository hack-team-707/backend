import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { LocationEncryptionService } from '../../common/location-encryption.service';
import { GeoCoordinates, ProblemStatus } from '../../shared';
import { CreateProblemDto } from './dto/problem.dto';
import { Problem, ProblemInput } from './entities/problem.entity';

@Injectable()
export class ProblemsService {
  constructor(
    @InjectRepository(Problem)
    private readonly repository: Repository<Problem>,
    @Optional()
    private readonly locationEncryption?: LocationEncryptionService,
  ) {}

  async create(
    ownerId: string,
    input: ProblemInput,
    confirmed: boolean,
  ): Promise<Problem> {
    if (!confirmed)
      throw new ForbiddenException('Explicit confirmation is required');
    if (!input.description?.trim() && !input.audioUrl)
      throw new ForbiddenException('Description or audio is required');
    const now = new Date().toISOString();
    const problem = this.repository.create({
      id: randomUUID(),
      ownerId,
      ...(input.description?.trim()
        ? { description: input.description.trim() }
        : {}),
      ...(input.audioUrl ? { audioUrl: input.audioUrl } : {}),
      imageUrls: input.imageUrls ?? [],
      attachmentUrls: input.attachmentUrls ?? [],
      ...(input.geolocation
        ? {
            encryptedGeolocation: this.encryptLocation(input.geolocation),
          }
        : {}),
      hasGeolocation: Boolean(input.geolocation),
      status: ProblemStatus.PUBLISHED,
      createdAt: now,
      updatedAt: now,
    });
    return this.repository.save(problem);
  }

  createFromDto(ownerId: string, dto: CreateProblemDto): Promise<Problem> {
    return this.create(ownerId, dto, dto.confirmed);
  }

  private encryptLocation(geolocation: GeoCoordinates): string {
    if (!this.locationEncryption) {
      throw new Error('Location encryption service is unavailable');
    }
    return this.locationEncryption.encrypt(geolocation);
  }

  findMine(ownerId: string): Promise<Problem[]> {
    return this.repository.find({ where: { ownerId } });
  }

  async findOne(ownerId: string, id: string): Promise<Problem> {
    const problem = await this.repository.findOneBy({ id });
    if (!problem) throw new NotFoundException('Problem not found');
    if (problem.ownerId !== ownerId)
      throw new ForbiddenException('Problem is not owned by user');
    return problem;
  }
}
