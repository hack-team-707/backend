import { Injectable } from '@nestjs/common';
import { ExternalResultType } from '../enums/external-result-type.enum';
import { TalentProviderName } from '../enums/talent-provider.enum';
import { ExternalTalentCandidate } from '../interfaces/talent-provider.interface';

@Injectable()
export class FreelancerTalentMapper {
  map(payload: unknown): ExternalTalentCandidate[] {
    const root = this.record(payload);
    const usersValue = root.users ?? this.record(root.result).users;
    const users = Array.isArray(usersValue)
      ? usersValue
      : Object.values(this.record(usersValue));
    return users.flatMap((value) => {
      const user = this.record(value);
      const id = this.string(user.id);
      const username = this.string(user.username);
      const name =
        this.string(user.display_name) ||
        this.string(user.public_name) ||
        username;
      if (!id || !name) return [];
      const profile = this.record(user.profile);
      const reputation = this.record(user.reputation);
      const entireHistory = this.record(reputation.entire_history);
      const jobs = Array.isArray(user.jobs) ? user.jobs : [];
      const skills = jobs
        .map((job) => {
          const value = this.record(job);
          return this.string(value.name) || this.string(value.seo_url);
        })
        .filter((skill): skill is string => Boolean(skill));
      const profileUrl = username
        ? `https://www.freelancer.com/u/${encodeURIComponent(username)}`
        : undefined;
      return [
        {
          provider: TalentProviderName.FREELANCER,
          externalId: id,
          resultType: ExternalResultType.PERSON,
          name,
          headline: this.string(profile.headline) || this.string(user.tagline),
          description:
            this.string(profile.summary) ||
            this.string(user.profile_description) ||
            this.string(user.description),
          skills,
          rating:
            this.number(entireHistory.overall) ||
            this.number(reputation.overall),
          reviewCount:
            this.number(entireHistory.reviews) ??
            this.number(reputation.reviews) ??
            this.number(user.review_count),
          hourlyRate:
            this.number(profile.hourly_rate) ?? this.number(user.hourly_rate),
          currency:
            this.string(this.record(user.primary_currency).code) ||
            this.string(this.record(user.currency).code),
          location: {
            city: this.string(this.record(user.location).city),
            country:
              this.string(this.record(user.location).country) ||
              this.string(this.record(user.country).name),
          },
          profileUrl,
          contactUrl: profileUrl,
          availability: 'UNKNOWN',
          compatibilityScore: 0,
          compatibilityReasons: [],
          missingSkills: [],
          metadata: {
            publicProfile: true,
            username,
          },
        } satisfies ExternalTalentCandidate,
      ];
    });
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private string(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim()
      ? value.trim()
      : typeof value === 'number'
        ? String(value)
        : undefined;
  }

  private number(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = typeof value === 'string' ? Number(value) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
