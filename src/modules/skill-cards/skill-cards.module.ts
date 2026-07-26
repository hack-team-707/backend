import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SkillCard } from './entities/skill-card.entity';
import { SkillCardsController } from './skill-cards.controller';
import { SkillCardsService } from './skill-cards.service';

@Module({
  imports: [TypeOrmModule.forFeature([SkillCard])],
  controllers: [SkillCardsController],
  providers: [SkillCardsService],
  exports: [SkillCardsService],
})
export class SkillCardsModule {}
