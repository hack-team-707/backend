import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../common/auth.decorators';
import { UserRole } from '../../shared';
import { CreateDisputeDto, ReviewDisputeDto } from './dto/dispute.dto';
import { DisputesService } from './disputes.service';
import { Dispute } from './entities/dispute.entity';

@ApiTags('disputes')
@ApiBearerAuth()
@Controller('disputes')
export class DisputesController {
  constructor(private readonly service: DisputesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDisputeDto,
  ): Promise<Dispute> {
    return this.service.create(user.userId, dto);
  }

  @Get('mine')
  findMine(@CurrentUser() user: AuthenticatedUser): Promise<Dispute[]> {
    return this.service.findMine(user.userId);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/disputes')
export class AdminDisputesController {
  constructor(private readonly service: DisputesService) {}

  @Get()
  findAll(): Promise<Dispute[]> {
    return this.service.findAll();
  }

  @Patch(':id')
  review(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviewDisputeDto,
  ): Promise<Dispute> {
    return this.service.review(actor.userId, id, dto);
  }
}
