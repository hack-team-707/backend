import { Injectable } from '@nestjs/common';
import { ExternalResultType } from '../enums/external-result-type.enum';
import { TalentProviderName } from '../enums/talent-provider.enum';
import { ExternalTalentCandidate } from '../interfaces/talent-provider.interface';

@Injectable()
export class GooglePlacesMapper {
  map(payload: unknown): ExternalTalentCandidate[] {
    const root = this.record(payload);
    const places = Array.isArray(root.places) ? root.places : [];
    return places.flatMap((value) => {
      const place = this.record(value);
      const id = this.string(place.id);
      const name = this.string(this.record(place.displayName).text);
      if (!id || !name) return [];
      const coordinates = this.record(place.location);
      return [
        {
          provider: TalentProviderName.GOOGLE_PLACES,
          externalId: id,
          resultType: ExternalResultType.BUSINESS,
          name,
          skills: Array.isArray(place.types)
            ? place.types.filter(
                (type): type is string => typeof type === 'string',
              )
            : [],
          rating: this.number(place.rating),
          reviewCount: this.number(place.userRatingCount),
          location: {
            address: this.string(place.formattedAddress),
            latitude: this.number(coordinates.latitude),
            longitude: this.number(coordinates.longitude),
          },
          profileUrl: this.string(place.googleMapsUri),
          contactUrl: this.string(place.googleMapsUri),
          websiteUrl: this.string(place.websiteUri),
          phone: this.string(place.internationalPhoneNumber),
          availability: 'UNKNOWN',
          compatibilityScore: 0,
          compatibilityReasons: [],
          missingSkills: [],
          metadata: {
            businessStatus: this.string(place.businessStatus),
            publicPlace: true,
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
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private number(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }
}
