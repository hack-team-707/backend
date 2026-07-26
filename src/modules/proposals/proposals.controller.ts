import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../common/auth.decorators';
import { UserRole } from '../../shared';
import {
  GenerateProposalDraftDto,
  RespondToProposalDto,
  ReviseProposalDto,
  SubmitProposalDto,
} from './dto/proposal.dto';
import { Proposal } from './entities/proposal.entity';
import { ProposalsService } from './proposals.service';

@ApiTags('proposals')
@ApiBearerAuth()
@Controller('proposals')
export class ProposalsController {
  constructor(private readonly service: ProposalsService) {}

  @Post('draft')
  @Roles(UserRole.SOLVER)
  generateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateProposalDraftDto,
  ) {
    return this.service.generateDraft(
      user.userId,
      dto.matchId,
      dto.instruction,
      dto.currentDraft,
    );
  }

  @Post()
  @Roles(UserRole.SOLVER)
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitProposalDto,
  ): Promise<Proposal> {
    return this.service.submit(user.userId, dto);
  }

  @Get()
  @Roles(UserRole.REQUESTER, UserRole.SOLVER)
  findMine(@CurrentUser() user: AuthenticatedUser): Promise<Proposal[]> {
    return this.service.findMine(user.userId);
  }

  @Get(':id')
  @Roles(UserRole.REQUESTER, UserRole.SOLVER)
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Proposal> {
    return this.service.findOne(user.userId, id);
  }

  @Patch(':id/respond')
  @Roles(UserRole.REQUESTER)
  respond(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RespondToProposalDto,
  ): Promise<Proposal> {
    return this.service.respond(user.userId, id, dto);
  }

  @Patch(':id/revise')
  @Roles(UserRole.SOLVER)
  revise(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviseProposalDto,
  ): Promise<Proposal> {
    return this.service.revise(user.userId, id, dto);
  }
}
