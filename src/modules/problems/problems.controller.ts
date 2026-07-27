import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  Public,
  Roles,
} from '../../common/auth.decorators';
import { UserRole } from '../../shared';
import { CreateProblemDto } from './dto/problem.dto';
import { Problem } from './entities/problem.entity';
import { ProblemsService } from './problems.service';
import {
  PublicProblemIndexItem,
  PublicProblemView,
} from './public-problem.types';
import { PublicProblemsService } from './public-problems.service';

@ApiTags('problems')
@ApiBearerAuth()
@Roles(UserRole.REQUESTER)
@Controller('problems')
export class ProblemsController {
  constructor(
    private readonly service: ProblemsService,
    private readonly publicProblems: PublicProblemsService,
  ) {}
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProblemDto,
  ): Promise<Problem> {
    return this.service.createFromDto(user.userId, dto);
  }
  @Get() findMine(@CurrentUser() user: AuthenticatedUser): Promise<Problem[]> {
    return this.service.findMine(user.userId);
  }
  @Public()
  @Get('public')
  findPublicIndex(): Promise<PublicProblemIndexItem[]> {
    return this.publicProblems.findIndex();
  }
  @Public()
  @Get('public/:id')
  findPublic(@Param('id') id: string): Promise<PublicProblemView> {
    return this.publicProblems.findOne(id);
  }
  @Get(':id') findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Problem> {
    return this.service.findOne(user.userId, id);
  }
}
