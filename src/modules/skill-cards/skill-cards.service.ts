import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { SkillCardStatus } from '../../shared';
import { CreateSkillCardDto, UpdateSkillCardDto } from './dto/skill-card.dto';
import { SkillCard, SkillCardInput } from './entities/skill-card.entity';

@Injectable()
export class SkillCardsService {
  constructor(
    @InjectRepository(SkillCard)
    private readonly repository: Repository<SkillCard>,
  ) {}

  async create(
    ownerId: string,
    input: SkillCardInput,
    confirmed: boolean,
  ): Promise<SkillCard> {
    if (!confirmed)
      throw new ForbiddenException('Explicit confirmation is required');
    const now = new Date().toISOString();
    const card = this.repository.create({
      id: randomUUID(),
      ownerId,
      ...input,
      tags: input.tags.map((tag) => tag.trim()),
      status: SkillCardStatus.PUBLISHED,
      createdAt: now,
      updatedAt: now,
    });
    return this.repository.save(card);
  }

  createFromDto(ownerId: string, dto: CreateSkillCardDto): Promise<SkillCard> {
    return this.create(ownerId, dto, dto.confirmed);
  }

  findMine(ownerId: string): Promise<SkillCard[]> {
    return this.repository.find({ where: { ownerId } });
  }

  findPublished(): Promise<SkillCard[]> {
    return this.repository.find({
      where: { status: SkillCardStatus.PUBLISHED },
      order: { updatedAt: 'DESC' },
    });
  }

  findPublishedForOwner(ownerId: string): Promise<SkillCard[]> {
    return this.repository.find({
      where: { ownerId, status: SkillCardStatus.PUBLISHED },
      order: { updatedAt: 'DESC' },
    });
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateSkillCardDto,
  ): Promise<SkillCard> {
    const card = await this.owned(ownerId, id);
    this.repository.merge(card, {
      ...(dto.proficiencyLevel
        ? { proficiencyLevel: dto.proficiencyLevel }
        : {}),
      ...(dto.tags ? { tags: dto.tags.map((tag) => tag.trim()) } : {}),
      ...(dto.evidenceLinks ? { evidenceLinks: dto.evidenceLinks } : {}),
      ...(dto.assessment ? { assessment: dto.assessment } : {}),
      updatedAt: new Date().toISOString(),
    });
    return this.repository.save(card);
  }

  async remove(ownerId: string, id: string, confirmed: boolean): Promise<void> {
    if (!confirmed)
      throw new ForbiddenException('Explicit confirmation is required');
    await this.owned(ownerId, id);
    await this.repository.delete({ id });
  }

  private async owned(ownerId: string, id: string): Promise<SkillCard> {
    const card = await this.repository.findOneBy({ id });
    if (!card) throw new NotFoundException('Skill card not found');
    if (card.ownerId !== ownerId)
      throw new ForbiddenException('Skill card is not owned by user');
    return card;
  }
}
