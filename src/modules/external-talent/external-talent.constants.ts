export const EXTERNAL_TALENT_PROVIDERS = Symbol('EXTERNAL_TALENT_PROVIDERS');

export const GOOGLE_PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.types',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.internationalPhoneNumber',
].join(',');

export const MAX_EXTERNAL_TALENT_RESULTS = 20;
