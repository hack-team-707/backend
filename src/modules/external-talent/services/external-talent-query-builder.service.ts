import { Injectable } from '@nestjs/common';
import { ProblemModality } from '../enums/problem-modality.enum';
import { SearchExternalTalentDto } from '../dto/search-external-talent.dto';
import { TalentSearchInput } from '../interfaces/talent-provider.interface';

@Injectable()
export class ExternalTalentQueryBuilderService {
  classify(dto: SearchExternalTalentDto): ProblemModality {
    if (dto.modality) return dto.modality;
    const text = this.normalize(
      `${dto.title} ${dto.description} ${dto.category} ${dto.requiredSkills.join(' ')}`,
    );
    const local =
      /\b(instal|presencial|electric|plomer|camar|cablead|constru|mantenim|reparacion|computadora|hardware|red fisica|tecnico)/i.test(
        text,
      );
    const remote =
      /\b(software|desarroll|disen|marketing|tradu|redacci|consult|servidor|licencia|office|web|api|program|soporte remoto)/i.test(
        text,
      );
    return local && remote
      ? ProblemModality.HYBRID
      : local
        ? ProblemModality.LOCAL
        : ProblemModality.REMOTE;
  }

  build(dto: SearchExternalTalentDto): TalentSearchInput {
    const requiredSkills = [
      ...new Set(dto.requiredSkills.map((skill) => this.clean(skill))),
    ].filter(Boolean);
    return {
      problemId: dto.problemId,
      title: this.clean(dto.title),
      description: this.clean(dto.description, 1500),
      category: this.clean(dto.category),
      requiredSkills,
      modality: this.classify(dto),
      language: dto.language || 'es',
      city: dto.city ? this.clean(dto.city) : undefined,
      countryCode: dto.countryCode?.toUpperCase(),
      latitude: dto.latitude,
      longitude: dto.longitude,
      radiusMeters: dto.radiusMeters,
      limit: dto.limit,
    };
  }

  freelancerQuery(input: TalentSearchInput): string {
    return this.clean(
      [input.category, ...input.requiredSkills.slice(0, 5), input.title].join(
        ' ',
      ),
      500,
    );
  }

  googleQuery(input: TalentSearchInput): string {
    const expertise =
      input.requiredSkills.slice(0, 3).join(' ') ||
      input.category ||
      input.title;
    return this.clean(
      [expertise, input.city ? `en ${input.city}` : '', input.countryCode]
        .filter(Boolean)
        .join(' '),
      500,
    );
  }

  private clean(value: string, max = 500): string {
    return value
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  private normalize(value: string): string {
    return value
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  }
}
