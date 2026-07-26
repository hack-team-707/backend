import { parseAiAnalysis } from './ai-provider';

describe('parseAiAnalysis', () => {
  it('normalizes a valid provider response', () => {
    expect(
      parseAiAnalysis(
        '```json\n{"category":"Plomería","urgencyLevel":"High","requiredSkills":["Tuberías","Tuberías"],"summary":"Fuga activa"}\n```',
      ),
    ).toEqual({
      category: 'Plomería',
      urgencyLevel: 'High',
      requiredSkills: ['Tuberías'],
      summary: 'Fuga activa',
    });
  });

  it('rejects responses outside the provider-neutral schema', () => {
    expect(() => parseAiAnalysis('{"category":"Plomería"}')).toThrow(
      'invalid analysis schema',
    );
  });
});
