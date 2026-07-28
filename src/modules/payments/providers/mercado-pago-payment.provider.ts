import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatMoney, parseMoney } from '../../../common/money';
import { PaymentStatus } from '../../../shared';
import {
  CreatePreferenceInput,
  PaymentPreference,
  PaymentProvider,
  ProviderPayment,
  ProviderRefund,
} from './payment-provider';

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}

interface MercadoPagoBackUrls {
  success: string;
  failure: string;
  pending: string;
}

@Injectable()
export class MercadoPagoPaymentProvider implements PaymentProvider {
  constructor(private readonly config: ConfigService) {}

  async createPreference(
    input: CreatePreferenceInput,
  ): Promise<PaymentPreference> {
    const response = await this.request<Record<string, unknown>>(
      '/checkout/preferences',
      {
        method: 'POST',
        idempotencyKey: input.idempotencyKey,
        body: {
          items: [
            {
              id: input.paymentId,
              title: input.installmentDescription,
              quantity: 1,
              currency_id: input.currency,
              unit_price: this.moneyToJsonNumber(input.amount),
            },
          ],
          external_reference: input.paymentId,
          notification_url: this.config.getOrThrow<string>(
            'MERCADO_PAGO_NOTIFICATION_URL',
          ),
          back_urls: this.backUrls(),
          auto_return: 'approved',
        },
      },
    );
    const id = this.requiredString(response.id, 'preference id');
    const checkoutUrl = this.requiredString(
      response.init_point,
      'checkout URL',
    );
    return { id, checkoutUrl, externalReference: input.paymentId };
  }

  async getPayment(providerPaymentId: string): Promise<ProviderPayment> {
    const response = await this.request<Record<string, unknown>>(
      `/v1/payments/${encodeURIComponent(providerPaymentId)}`,
      { method: 'GET' },
    );
    const providerStatus = this.requiredString(response.status, 'status');
    return {
      id: String(response.id ?? providerPaymentId),
      externalReference:
        typeof response.external_reference === 'string'
          ? response.external_reference
          : null,
      amount: this.moneyFromJson(response.transaction_amount, 'amount'),
      refundedAmount: this.moneyFromJson(
        response.transaction_amount_refunded ?? 0,
        'refunded amount',
      ),
      currency: this.requiredString(response.currency_id, 'currency'),
      providerStatus,
      status: this.mapStatus(providerStatus),
    };
  }

  async refund(
    providerPaymentId: string,
    amount: string,
    idempotencyKey: string,
  ): Promise<ProviderRefund> {
    const response = await this.request<Record<string, unknown>>(
      `/v1/payments/${encodeURIComponent(providerPaymentId)}/refunds`,
      {
        method: 'POST',
        idempotencyKey,
        body: { amount: this.moneyToJsonNumber(amount) },
      },
    );
    return {
      id: this.requiredString(
        response.id === undefined ? undefined : String(response.id),
        'refund id',
      ),
      providerStatus:
        typeof response.status === 'string' ? response.status : 'unknown',
    };
  }

  private async request<T>(
    path: string,
    options: {
      method: 'GET' | 'POST';
      idempotencyKey?: string;
      body?: Record<string, unknown>;
    },
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.getOrThrow<string>('MERCADO_PAGO_ACCESS_TOKEN')}`,
      'Content-Type': 'application/json',
    };
    if (options.idempotencyKey)
      headers['X-Idempotency-Key'] = options.idempotencyKey;
    let response: Response;
    try {
      response = await fetch(
        `${this.config.getOrThrow<string>('MERCADO_PAGO_BASE_URL')}${path}`,
        {
          method: options.method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch (error) {
      throw new PaymentProviderError(
        error instanceof Error && error.name === 'TimeoutError'
          ? 'Payment provider request timed out'
          : 'Payment provider request failed',
        'provider_unavailable',
        undefined,
        true,
      );
    }
    if (!response.ok) {
      throw new PaymentProviderError(
        'Payment provider rejected the request',
        'provider_http_error',
        response.status,
        response.status === 429 || response.status >= 500,
      );
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new PaymentProviderError(
        'Payment provider returned invalid JSON',
        'provider_invalid_response',
        response.status,
      );
    }
  }

  private backUrls(): MercadoPagoBackUrls {
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        this.config.getOrThrow<string>('MERCADO_PAGO_BACK_URLS'),
      );
    } catch {
      throw new PaymentProviderError(
        'Payment back URLs are not configured correctly',
        'provider_configuration_error',
      );
    }
    if (!parsed || typeof parsed !== 'object')
      throw new PaymentProviderError(
        'Payment back URLs are not configured correctly',
        'provider_configuration_error',
      );
    const candidate = parsed as Record<string, unknown>;
    return {
      success: this.requiredString(candidate.success, 'success back URL'),
      failure: this.requiredString(candidate.failure, 'failure back URL'),
      pending: this.requiredString(candidate.pending, 'pending back URL'),
    };
  }

  private moneyToJsonNumber(value: string): number {
    const canonical = formatMoney(parseMoney(value));
    const converted = Number(canonical);
    if (!Number.isFinite(converted) || converted <= 0)
      throw new PaymentProviderError(
        'Amount cannot be represented by the provider JSON boundary',
        'provider_invalid_amount',
      );
    return converted;
  }

  private moneyFromJson(value: unknown, label: string): string {
    if (typeof value !== 'number' && typeof value !== 'string')
      throw new PaymentProviderError(
        `Payment provider returned an invalid ${label}`,
        'provider_invalid_response',
      );
    try {
      return formatMoney(parseMoney(String(value)));
    } catch {
      throw new PaymentProviderError(
        `Payment provider returned an invalid ${label}`,
        'provider_invalid_response',
      );
    }
  }

  private requiredString(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim())
      throw new PaymentProviderError(
        `Payment provider returned an invalid ${label}`,
        'provider_invalid_response',
      );
    return value;
  }

  private mapStatus(status: string): PaymentStatus {
    switch (status) {
      case 'approved':
        return PaymentStatus.SUCCEEDED;
      case 'pending':
        return PaymentStatus.PENDING;
      case 'authorized':
      case 'in_process':
      case 'in_mediation':
        return PaymentStatus.PROCESSING;
      case 'rejected':
        return PaymentStatus.FAILED;
      case 'cancelled':
        return PaymentStatus.CANCELLED;
      case 'refunded':
      case 'charged_back':
        return PaymentStatus.REFUNDED;
      default:
        throw new PaymentProviderError(
          'Payment provider returned an unsupported status',
          'provider_unsupported_status',
        );
    }
  }
}
