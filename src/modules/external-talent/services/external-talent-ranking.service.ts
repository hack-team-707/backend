import { Injectable } from '@nestjs/common';
import { ExternalTalentCandidate } from '../interfaces/talent-provider.interface';
import { TalentProviderName } from '../enums/talent-provider.enum';

@Injectable()
export class ExternalTalentRankingService {
  rank(
    candidate: ExternalTalentCandidate,
    requiredSkills: string[],
  ): ExternalTalentCandidate {
    const normalizedRequired = requiredSkills.map(this.normalize);
    const corpus = [
      candidate.name,
      candidate.headline,
      candidate.description,
      ...candidate.skills,
    ]
      .filter(Boolean)
      .join(' ')
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
    const matched = requiredSkills.filter((_, index) =>
      corpus.includes(normalizedRequired[index]),
    );
    const missingSkills = requiredSkills.filter(
      (skill) => !matched.includes(skill),
    );
    const skillsScore = requiredSkills.length
      ? matched.length / requiredSkills.length
      : 0.5;
    const ratingScore =
      typeof candidate.rating === 'number'
        ? Math.min(1, candidate.rating / 5)
        : undefined;
    const reviewsScore =
      typeof candidate.reviewCount === 'number'
        ? Math.min(1, Math.log10(candidate.reviewCount + 1) / 3)
        : undefined;
    const completenessScore =
      [
        candidate.headline,
        candidate.description,
        candidate.profileUrl ?? candidate.websiteUrl,
        candidate.location?.address,
      ].filter(Boolean).length / 4;
    const signals =
      candidate.provider === TalentProviderName.FREELANCER
        ? [
            { value: skillsScore, weight: 50 },
            { value: ratingScore, weight: 20 },
            { value: reviewsScore, weight: 10 },
            {
              value: candidate.location?.country ? 1 : undefined,
              weight: 10,
            },
            { value: completenessScore, weight: 10 },
          ]
        : [
            { value: skillsScore, weight: 35 },
            { value: ratingScore, weight: 25 },
            { value: reviewsScore, weight: 15 },
            {
              value:
                typeof candidate.location?.distanceMeters === 'number'
                  ? Math.max(0, 1 - candidate.location.distanceMeters / 50000)
                  : undefined,
              weight: 15,
            },
            { value: completenessScore, weight: 10 },
          ];
    const present = signals.filter(
      (signal): signal is { value: number; weight: number } =>
        typeof signal.value === 'number',
    );
    const weight = present.reduce((total, signal) => total + signal.weight, 0);
    const compatibilityScore = Math.round(
      (present.reduce(
        (total, signal) => total + signal.value * signal.weight,
        0,
      ) /
        Math.max(1, weight)) *
        100,
    );
    return {
      ...candidate,
      availability: 'UNKNOWN',
      compatibilityScore,
      compatibilityReasons: [
        matched.length
          ? `Coincide con ${matched.length} capacidad${matched.length === 1 ? '' : 'es'} requerida${matched.length === 1 ? '' : 's'}`
          : 'La coincidencia se estima con la categoría y el perfil público',
        ...(typeof candidate.rating === 'number'
          ? [`Valoración pública ${candidate.rating.toFixed(1)}/5`]
          : []),
      ],
      missingSkills,
    };
  }

  private normalize(value: string): string {
    return value
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
  }
}
