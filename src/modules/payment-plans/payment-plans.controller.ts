import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../common/auth.decorators';
import { UserRole } from '../../shared';
import {
  AcceptPaymentPlanShareDto,
  CreatePaymentPlanDto,
} from './dto/payment-plan.dto';
import { PaymentPlansService, PaymentPlanView } from './payment-plans.service';

@ApiTags('payment-plans')
@ApiBearerAuth()
@Roles(UserRole.REQUESTER, UserRole.SOLVER)
@Controller('projects/:projectId/payment-plans')
export class PaymentPlansController {
  constructor(private readonly plans: PaymentPlansService) {}

  @Get('current')
  current(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<PaymentPlanView> {
    return this.plans.current(user.userId, projectId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreatePaymentPlanDto,
  ): Promise<PaymentPlanView> {
    return this.plans.create(user.userId, projectId, dto);
  }

  @Patch(':planId/shares/accept')
  acceptShare(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('planId') planId: string,
    @Body() dto: AcceptPaymentPlanShareDto,
  ): Promise<PaymentPlanView> {
    return this.plans.acceptShare(user.userId, projectId, planId, dto);
  }
}
