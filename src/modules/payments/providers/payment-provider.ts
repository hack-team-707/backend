import { PaymentStatus } from '../../../shared';

export interface CreatePreferenceInput {
  paymentId: string;
  installmentDescription: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
}

export interface PaymentPreference {
  id: string;
  checkoutUrl: string;
  externalReference: string;
}

export interface ProviderPayment {
  id: string;
  externalReference: string | null;
  amount: string;
  refundedAmount: string;
  currency: string;
  providerStatus: string;
  status: PaymentStatus;
}

export interface ProviderRefund {
  id: string;
  providerStatus: string;
}

export interface PaymentProvider {
  createPreference(input: CreatePreferenceInput): Promise<PaymentPreference>;
  getPayment(providerPaymentId: string): Promise<ProviderPayment>;
  refund(
    providerPaymentId: string,
    amount: string,
    idempotencyKey: string,
  ): Promise<ProviderRefund>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
