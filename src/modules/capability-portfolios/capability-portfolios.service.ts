import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { CapabilityAssessmentState } from '../ai-engine/ai-provider';
import { CapabilityPortfolio } from './entities/capability-portfolio.entity';

export interface PublicCapabilityPortfolio {
  slug: string;
  capability: string;
  tags: string[];
  assessment: CapabilityPortfolio['assessment'];
  questions: CapabilityPortfolio['questions'];
  answers: CapabilityPortfolio['answers'];
  createdAt: string;
}

@Injectable()
export class CapabilityPortfoliosService {
  constructor(
    @InjectRepository(CapabilityPortfolio)
    private readonly repository: Repository<CapabilityPortfolio>,
    private readonly config: ConfigService,
  ) {}

  async createFromAssessment(
    ownerId: string,
    conversationId: string,
    assessment: CapabilityAssessmentState,
  ): Promise<{ portfolio: CapabilityPortfolio; url: string }> {
    if (!assessment.result) {
      throw new Error('Capability assessment must be completed');
    }
    const existing = await this.repository.findOneBy({ conversationId });
    const portfolio =
      existing ??
      (await this.repository.save(
        this.repository.create({
          id: randomUUID(),
          ownerId,
          conversationId,
          slug: this.createSlug(assessment.capability),
          capability: assessment.capability,
          tags: assessment.tags,
          assessment: assessment.result,
          questions: assessment.questions,
          answers: assessment.answers,
          createdAt: new Date().toISOString(),
        }),
      ));
    return {
      portfolio,
      url: `${this.config.getOrThrow<string>('PUBLIC_APP_URL')}/portfolio/${portfolio.slug}`,
    };
  }

  async findPublic(slug: string): Promise<PublicCapabilityPortfolio> {
    const portfolio = await this.repository.findOneBy({ slug });
    if (!portfolio) throw new NotFoundException('Portfolio not found');
    return {
      slug: portfolio.slug,
      capability: portfolio.capability,
      tags: portfolio.tags,
      assessment: portfolio.assessment,
      questions: portfolio.questions,
      answers: portfolio.answers,
      createdAt: portfolio.createdAt,
    };
  }

  private createSlug(capability: string): string {
    const prefix =
      capability
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48) || 'capacidad';
    return `${prefix}-${randomUUID().slice(0, 8)}`;
  }
}
