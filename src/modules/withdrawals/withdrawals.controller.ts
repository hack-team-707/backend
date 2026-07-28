import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Headers,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiQuery } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../common/auth.decorators';
import { UserRole } from '../../shared';
import {
  CreateWithdrawalDto,
  ReviewWithdrawalDto,
  MarkWithdrawalPaidDto,
  WithdrawalDto,
  WithdrawalListQuery,
} from './dto/withdrawal.dto';
import { WithdrawalsService } from './withdrawals.service';

@ApiTags('withdrawals')
@ApiBearerAuth()
@Controller('withdrawals')
export class WithdrawalsController {
  constructor(private readonly withdrawals: WithdrawalsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateWithdrawalDto,
  ): Promise<WithdrawalDto> {
    return this.withdrawals.create(user.userId, dto, idempotencyKey);
  }

  @Get('mine')
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WithdrawalListQuery,
  ): Promise<{ withdrawals: WithdrawalDto[]; total: number }> {
    return this.withdrawals.findMine(
      user.userId,
      query.status,
      query.limit,
      query.offset,
    );
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<WithdrawalDto> {
    return this.withdrawals.findOne(user.userId, id);
  }
}

@ApiTags('admin/withdrawals')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/withdrawals')
export class AdminWithdrawalsController {
  constructor(private readonly withdrawals: WithdrawalsService) {}

  @Get()
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async findAll(
    @Query() query: WithdrawalListQuery,
  ): Promise<{ withdrawals: WithdrawalDto[]; total: number }> {
    return this.withdrawals.findAll(query.status, query.limit, query.offset);
  }

  @Patch(':id/review')
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviewWithdrawalDto,
  ): Promise<WithdrawalDto> {
    return this.withdrawals.review(user.userId, id, dto);
  }

  @Patch(':id/mark-paid')
  markPaid(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MarkWithdrawalPaidDto,
  ): Promise<WithdrawalDto> {
    return this.withdrawals.markPaid(user.userId, id, dto);
  }
}
