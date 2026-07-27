import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBooleanString } from 'class-validator';
import {
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../common/auth.decorators';
import { UserRole } from '../../shared';
import { CreateSkillCardDto, UpdateSkillCardDto } from './dto/skill-card.dto';
import { SkillCard } from './entities/skill-card.entity';
import { SkillCardsService } from './skill-cards.service';

class ConfirmDeleteDto {
  @IsBooleanString()
  confirmed!: string;
}

@ApiTags('skill-cards')
@ApiBearerAuth()
@Roles(UserRole.SOLVER)
@Controller('skill-cards')
export class SkillCardsController {
  constructor(private readonly service: SkillCardsService) {}
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSkillCardDto,
  ): Promise<SkillCard> {
    return this.service.createFromDto(user.userId, dto);
  }
  @Get() findMine(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SkillCard[]> {
    return this.service.findMine(user.userId);
  }
  @Get('users/:ownerId')
  @Roles(UserRole.REQUESTER, UserRole.SOLVER)
  findPublishedForOwner(
    @Param('ownerId') ownerId: string,
  ): Promise<SkillCard[]> {
    return this.service.findPublishedForOwner(ownerId);
  }
  @Patch(':id') update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSkillCardDto,
  ): Promise<SkillCard> {
    return this.service.update(user.userId, id, dto);
  }
  @Delete(':id') remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: ConfirmDeleteDto,
  ): Promise<void> {
    return this.service.remove(user.userId, id, query.confirmed === 'true');
  }
}
