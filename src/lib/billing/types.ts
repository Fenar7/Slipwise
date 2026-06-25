/**
 * Phase 28.1: Unified Billing Types
 *
 * Gateway-agnostic type definitions for the dual-gateway billing engine.
 */

export type BillingGateway = "STRIPE" | "RAZORPAY";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "canceled";

export type BillingEventType =
  | "CHECKOUT_INITIATED"
  | "SUBSCRIPTION_CREATED"
  | "SUBSCRIPTION_ACTIVATED"
  | "PAYMENT_SUCCEEDED"
  | "PAYMENT_FAILED"
  | "SUBSCRIPTION_PAUSED"
  | "SUBSCRIPTION_RESUMED"
  | "SUBSCRIPTION_CANCELED"
  | "INVOICE_GENERATED"
  | "OVERAGE_CHARGED"
  | "DUNNING_ATTEMPT"
  | "REFUND_ISSUED";

export interface CheckoutParams {
  orgId: string;
  planId: string;
  billingInterval: "monthly" | "yearly";
  billingEmail: string;
  billingCountry: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  checkoutUrl: string;
  sessionId: string;
  gateway: BillingGateway;
  razorpayKeyId?: string;
}

export interface GatewayWebhookPayload {
  gateway: BillingGateway;
  razorpayKeyId?: string;
  eventId: string;
  eventType: string;
  rawPayload: unknown;
}

export interface OverageCalculation {
  resource: string;
  includedUnits: number;
  usedUnits: number;
  overageUnits: number;
  overageRatePaise: bigint;
  overageAmountPaise: bigint;
}

export interface DunningScheduleEntry {
  attempt: number;
  dayOffset: number;
  severity: "friendly" | "firm" | "urgent" | "final";
  sendNotification: boolean;
}

export const DUNNING_SCHEDULE: DunningScheduleEntry[] = [
  { attempt: 1, dayOffset: 1, severity: "friendly", sendNotification: false },
  { attempt: 2, dayOffset: 3, severity: "friendly", sendNotification: true },
  { attempt: 3, dayOffset: 7, severity: "firm", sendNotification: true },
  { attempt: 4, dayOffset: 14, severity: "firm", sendNotification: true },
  { attempt: 5, dayOffset: 21, severity: "urgent", sendNotification: true },
  { attempt: 6, dayOffset: 30, severity: "final", sendNotification: true },
];

export const MAX_DUNNING_ATTEMPTS = 6;
export const MAX_PAUSE_DAYS = 90;

export const OVERAGE_RATES_PAISE: Record<string, bigint> = {
  pdf_jobs: BigInt(100),       // ₹1 per extra PDF job
  pixel_jobs: BigInt(50),      // ₹0.50 per extra pixel job
  api_requests: BigInt(10),    // ₹0.10 per extra 1000 API requests
  storage_gb: BigInt(5000),    // ₹50 per extra GB/month
  email_sends: BigInt(50),     // ₹0.50 per extra email
};

export const OVERAGE_BILLING_UNIT_SIZES: Record<string, number> = {
  pdf_jobs: 1,
  pixel_jobs: 1,
  api_requests: 1000,
  storage_gb: 1,
  email_sends: 1,
};

/**
 * Valid subscription state transitions.
 * Key = current state, Value = array of allowed target states.
 */
export const SUBSCRIPTION_STATUS_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  trialing: ["active", "canceled"],
  active: ["past_due", "paused", "canceled"],
  past_due: ["active", "canceled"],
  paused: ["active", "canceled"],
  canceled: [], // terminal state — no resurrection
};

export interface GatewayAdapter {
  createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult>;
  cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<void>;
  pauseSubscription(subscriptionId: string): Promise<void>;
  resumeSubscription(subscriptionId: string): Promise<void>;
  retryPayment(subscriptionId: string): Promise<{ success: boolean; error?: string }>;
}
