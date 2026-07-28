import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../common/auth.decorators';
import { UserRole } from '../../shared';
import { ProcessPayoutDto } from './dto/payout.dto';
import { Payout } from './entities/payout.entity';
import { PayoutsService } from './payouts.service';

@ApiTags('admin/payouts')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/payouts')
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get()
  findAll(): Promise<Payout[]> {
    return this.payouts.findAll();
  }

  @Post(':withdrawalId/process')
  process(
    @CurrentUser() user: AuthenticatedUser,
    @Param('withdrawalId') withdrawalId: string,
    @Body() dto: ProcessPayoutDto,
  ): Promise<Payout> {
    return this.payouts.process(user.userId, withdrawalId, dto);
  }
}

@ApiTags('admin/finances')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/finances')
export class FinanceAdminController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get()
  summary() {
    return this.payouts.financeSummary();
  }
}
