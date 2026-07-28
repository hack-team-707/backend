import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  Public,
} from '../../common/auth.decorators';
import {
  CreateCheckoutDto,
  CreateRefundDto,
  MercadoPagoWebhookBody,
} from './dto/payment.dto';
import { PaymentRefund } from './entities/payment-refund.entity';
import { ProjectPayment } from './entities/project-payment.entity';
import { PaymentWebhookSignatureService } from './payment-webhook-signature.service';
import { CheckoutResult, PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('projects/:projectId/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('checkout')
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateCheckoutDto,
  ): Promise<CheckoutResult> {
    return this.payments.createCheckout(
      user.userId,
      projectId,
      idempotencyKey,
      dto,
    );
  }

  @Get(':paymentId')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('paymentId') paymentId: string,
  ): Promise<ProjectPayment> {
    return this.payments.findOne(user.userId, projectId, paymentId);
  }

  @Post(':paymentId/refunds')
  refund(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('paymentId') paymentId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateRefundDto,
  ): Promise<PaymentRefund> {
    return this.payments.refund(
      user.userId,
      user.roles,
      projectId,
      paymentId,
      idempotencyKey,
      dto,
    );
  }
}

@ApiTags('payment-webhooks')
@Controller('payments/webhooks')
export class PaymentWebhooksController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly signatures: PaymentWebhookSignatureService,
  ) {}

  @Public()
  @Post('mercado-pago')
  async mercadoPago(
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: MercadoPagoWebhookBody,
  ): Promise<{ received: true }> {
    const rawDataId = body?.data?.id;
    if (
      (typeof rawDataId !== 'string' && typeof rawDataId !== 'number') ||
      !String(rawDataId).trim()
    )
      throw new BadRequestException('Payment webhook data.id is required');
    const dataId = String(rawDataId);
    this.signatures.verify(signature, requestId, dataId);
    await this.payments.receiveMercadoPagoWebhook({
      dataId,
      requestId: requestId!,
      eventType:
        typeof body.type === 'string'
          ? body.type
          : typeof body.action === 'string'
            ? body.action
            : 'payment.updated',
    });
    return { received: true };
  }
}
