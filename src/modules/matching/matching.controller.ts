import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../common/auth.decorators';
import { UserRole } from '../../shared';
import {
  RankMatchesDto,
  RespondToMatchDto,
  SearchOpportunitiesQueryDto,
} from './dto/matching.dto';
import { Match } from './entities/match.entity';
import { MatchingService } from './matching.service';
import { OpportunitySearchService } from './opportunity-search.service';
import { FederatedOpportunitySearchResult } from './opportunity-search.types';
import { NoMatchResolutionView } from './no-match-resolution.types';

@ApiTags('matching')
@ApiBearerAuth()
@Controller('matching')
export class MatchingController {
  constructor(
    private readonly service: MatchingService,
    private readonly opportunitySearch: OpportunitySearchService,
  ) {}

  @Post('problems/:problemId/rank')
  @Roles(UserRole.REQUESTER)
  rank(
    @CurrentUser() user: AuthenticatedUser,
    @Param('problemId') problemId: string,
    @Body() dto: RankMatchesDto,
  ): Promise<Match[]> {
    return this.service.rank(user.userId, problemId, dto);
  }

  @Get('opportunities')
  @Roles(UserRole.SOLVER)
  findOpportunities(@CurrentUser() user: AuthenticatedUser): Promise<Match[]> {
    return this.service.findForSolver(user.userId);
  }

  @Get('opportunities/search')
  @Roles(UserRole.SOLVER)
  searchOpportunities(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchOpportunitiesQueryDto,
  ): Promise<FederatedOpportunitySearchResult> {
    return this.opportunitySearch.search(user.userId, query.q, query.limit);
  }

  @Get('no-match-resolutions')
  @Roles(UserRole.REQUESTER)
  findMyNoMatchResolutions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NoMatchResolutionView[]> {
    return this.service.findMyNoMatchResolutions(user.userId);
  }

  @Get('problems/:problemId/no-match-resolution')
  @Roles(UserRole.REQUESTER)
  findNoMatchResolution(
    @CurrentUser() user: AuthenticatedUser,
    @Param('problemId') problemId: string,
  ): Promise<NoMatchResolutionView> {
    return this.service.findNoMatchResolution(user.userId, problemId);
  }

  @Get('problems/:problemId')
  @Roles(UserRole.REQUESTER, UserRole.SOLVER)
  findForProblem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('problemId') problemId: string,
  ): Promise<Match[]> {
    return this.service.findForProblem(user.userId, problemId);
  }

  @Post(':id/request')
  @Roles(UserRole.REQUESTER)
  requestSolver(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.requestSolver(user.userId, id);
  }

  @Post(':id/apply')
  @Roles(UserRole.SOLVER)
  apply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Match> {
    return this.service.apply(user.userId, id);
  }

  @Patch(':id/respond')
  @Roles(UserRole.SOLVER)
  respond(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RespondToMatchDto,
  ): Promise<Match> {
    return this.service.respond(user.userId, id, dto);
  }
}
