import { FreelancerTalentMapper } from './freelancer-talent.mapper';
import { GooglePlacesMapper } from './google-places.mapper';

describe('external talent mappers', () => {
  it('normalizes only public Freelancer fields', () => {
    const [candidate] = new FreelancerTalentMapper().map({
      users: {
        42: {
          id: 42,
          username: 'ana-dev',
          display_name: 'Ana',
          profile_description: 'Especialista en NestJS',
          jobs: [{ name: 'NestJS' }],
          primary_currency: { code: 'USD' },
          reputation: {
            entire_history: { overall: 4.9, reviews: 8 },
          },
        },
      },
    });
    expect(candidate).toMatchObject({
      name: 'Ana',
      resultType: 'PERSON',
      availability: 'UNKNOWN',
      profileUrl: 'https://www.freelancer.com/u/ana-dev',
      rating: 4.9,
      reviewCount: 8,
      currency: 'USD',
      description: 'Especialista en NestJS',
    });
    expect(candidate).not.toHaveProperty('email');
  });

  it('normalizes a Google Place as a business with unknown availability', () => {
    const [candidate] = new GooglePlacesMapper().map({
      places: [
        {
          id: 'place-1',
          displayName: { text: 'Técnicos Lima' },
          formattedAddress: 'Lima, Perú',
          rating: 4.7,
          googleMapsUri: 'https://maps.google.com/example',
          types: ['computer_service'],
        },
      ],
    });
    expect(candidate).toMatchObject({
      resultType: 'BUSINESS',
      availability: 'UNKNOWN',
      rating: 4.7,
      profileUrl: 'https://maps.google.com/example',
    });
  });
});
