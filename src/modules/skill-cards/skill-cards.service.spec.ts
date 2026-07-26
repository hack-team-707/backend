import { ForbiddenException } from '@nestjs/common';
import { ProficiencyLevel } from '../../shared';
import { createMockRepository } from '../../test-utils/typeorm-repository.mock';
import { SkillCard } from './entities/skill-card.entity';
import { SkillCardsService } from './skill-cards.service';

describe('SkillCardsService', () => {
  const service = new SkillCardsService(createMockRepository<SkillCard>());
  const input = {
    proficiencyLevel: ProficiencyLevel.EXPERT,
    tags: ['nest'],
    evidenceLinks: ['https://example.com/evidence'],
  };

  it('requires confirmation and enforces ownership', async () => {
    await expect(service.create('owner', input, false)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const card = await service.create('owner', input, true);
    await expect(
      service.update('other', card.id, { tags: ['typescript'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await service.findMine('owner')).toHaveLength(1);
  });
});
