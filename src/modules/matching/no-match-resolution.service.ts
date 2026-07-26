import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { AiEngineService } from '../ai-engine/ai-engine.service';
import { Problem } from '../problems/entities/problem.entity';
import { NoMatchResolution } from './entities/no-match-resolution.entity';
import {
  ExternalChannelRecommendation,
  NoMatchResolutionView,
} from './no-match-resolution.types';

@Injectable()
export class NoMatchResolutionService {
  readonly minimumCoverage: number;

  constructor(
    @InjectRepository(NoMatchResolution)
    private readonly resolutions: Repository<NoMatchResolution>,
    private readonly aiEngine: AiEngineService,
    private readonly config: ConfigService,
  ) {
    this.minimumCoverage = config.get<number>(
      'MIN_INTERNAL_MATCH_COVERAGE',
      60,
    );
  }

  async createOrReplace(input: {
    ownerId: string;
    problem: Problem;
    requiredSkills: string[];
    bestCoverage: number;
  }): Promise<NoMatchResolution> {
    const existing = await this.resolutions.findOneBy({
      problemId: input.problem.id,
    });
    const now = new Date().toISOString();
    const recommendations = this.recommendations(input.requiredSkills);
    const aiGuide = this.config.get<boolean>(
      'NO_MATCH_AI_GUIDANCE_ENABLED',
      true,
    )
      ? await this.aiEngine.generateNoMatchGuide(
          input.problem.description ?? 'Problema sin descripción textual',
          input.requiredSkills,
        )
      : undefined;
    const entity =
      existing ??
      this.resolutions.create({
        id: randomUUID(),
        problemId: input.problem.id,
        ownerId: input.ownerId,
        createdAt: now,
      });
    this.resolutions.merge(entity, {
      minimumCoverage: this.minimumCoverage,
      bestCoverage: input.bestCoverage,
      requiredSkills: input.requiredSkills,
      message:
        'Aún no encontramos un solucionador local con la cobertura mínima necesaria. Tu problema seguirá visible para futuras coincidencias y, mientras tanto, te mostramos alternativas seguras.',
      recommendations,
      aiGuide: aiGuide ?? null,
      updatedAt: now,
    });
    return this.resolutions.save(entity);
  }

  async clear(problemId: string): Promise<void> {
    await this.resolutions.delete({ problemId });
  }

  async findForOwner(
    ownerId: string,
    problemId: string,
  ): Promise<NoMatchResolutionView> {
    const resolution = await this.resolutions.findOneBy({ problemId });
    if (!resolution)
      throw new NotFoundException('No-match resolution not found');
    if (resolution.ownerId !== ownerId) {
      throw new ForbiddenException('No-match resolution is not owned by user');
    }
    return resolution;
  }

  findAllForOwner(ownerId: string): Promise<NoMatchResolution[]> {
    return this.resolutions.find({
      where: { ownerId },
      order: { updatedAt: 'DESC' },
    });
  }

  private recommendations(
    requiredSkills: string[],
  ): ExternalChannelRecommendation[] {
    const query = encodeURIComponent(
      requiredSkills.slice(0, 4).join(' ') || 'servicios profesionales',
    );
    return [
      {
        id: 'workana',
        name: 'Workana',
        kind: 'platform',
        description:
          'Marketplace orientado a profesionales independientes en Latinoamérica.',
        reason:
          'Permite publicar una necesidad y comparar perfiles y propuestas externas.',
        url: 'https://www.workana.com/es',
        source: 'predefined_rule',
      },
      {
        id: 'freelancer',
        name: 'Freelancer',
        kind: 'platform',
        description:
          'Plataforma internacional para publicar proyectos y recibir ofertas.',
        reason:
          'Amplía la búsqueda a una red global de profesionales por especialidad.',
        url: 'https://www.freelancer.com/hire/',
        source: 'predefined_rule',
      },
      {
        id: 'linkedin-services',
        name: 'LinkedIn Services',
        kind: 'professional_directory',
        description:
          'Directorio de proveedores y profesionales con perfiles públicos.',
        reason:
          'Facilita revisar experiencia, ubicación y referencias antes de contactar.',
        url: 'https://www.linkedin.com/services/',
        source: 'predefined_rule',
      },
      {
        id: 'local-directory',
        name: 'Directorio profesional local',
        kind: 'professional_directory',
        description:
          'Búsqueda geográfica de empresas, técnicos y gremios cercanos.',
        reason:
          'Es una alternativa útil cuando el trabajo requiere presencia física o licencia local.',
        url: `https://www.google.com/maps/search/?api=1&query=${query}`,
        source: 'predefined_rule',
      },
    ];
  }
}
