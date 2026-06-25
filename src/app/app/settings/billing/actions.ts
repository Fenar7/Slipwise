"use server";

/**
 * Phase 28.1: Billing Settings Server Actions
 *
 * Manages subscription checkout, plan switching, cancellation,
 * and billing history for the current org.
 */

import { requireOrgContext, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { initiateCheckout, cancelSubscription, pauseSubscription, resumeSubscription } from "@/lib/billing/engine";
import { listBillingInvoices } from "@/lib/billing/invoicing";
import { getNextDunningAttempt } from "@/lib/billing/dunning";
import { getCurrentUsage } from "@/lib/billing/metering";
import { logAudit } from "@/lib/audit";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

async function resolveCheckoutContext(orgId: string, userId: string) {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: {
      id: true,
      billingAccount: {
        select: {
          billingCountry: true,
          billingEmail: true,
        },
      },
      defaults: {
        select: {
          country: true,
        },
      },
      members: {
        where: { userId },
        select: { user: { select: { email: true } } },
      },
    },
  });

  return {
    billingEmail:
      org.billingAccount?.billingEmail ||
      org.members[0]?.user?.email ||
      "",
    billingCountry:
      org.billingAccount?.billingCountry ||
      org.defaults?.country ||
      "IN",
  };
}

export async function initiatePlanCheckoutAction(params: {
  planId: string;
  billingInterval: "monthly" | "yearly";
  successUrl: string;
  cancelUrl: string;
}): Promise<ActionResult<{ checkoutUrl: string; gateway: string; sessionId: string; razorpayKeyId?: string }>> {
  const { orgId, userId } = await requireRole("admin");
  const { billingEmail, billingCountry } = await resolveCheckoutContext(
    orgId,
    userId,
  );

  const result = await initiateCheckout({
    orgId,
    planId: params.planId,
    billingInterval: params.billingInterval,
    billingEmail,
    billingCountry,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
  });

  if (result.gateway === "RAZORPAY" && result.sessionId) {
    await db.subscription.upsert({
      where: { orgId },
      update: { razorpaySubId: result.sessionId },
      create: { orgId, planId: "free", status: "pending", razorpaySubId: result.sessionId },
    });
  }

  await logAudit({
    orgId,
    actorId: userId,
    action: "billing.checkout_initiated",
    entityType: "Subscription",
    entityId: orgId,
    metadata: {
      planId: params.planId,
      billingInterval: params.billingInterval,
      gateway: result.gateway,
      billingCountry,
    },
  });

  return { success: true, data: { checkoutUrl: result.checkoutUrl, gateway: result.gateway, sessionId: result.sessionId, razorpayKeyId: result.razorpayKeyId } };
}

export async function cancelSubscriptionAction(params: {
  atPeriodEnd: boolean;
}): Promise<ActionResult<{ status: string }>> {
  const { orgId, userId } = await requireRole("admin");

  await cancelSubscription(orgId, params.atPeriodEnd);
  await logAudit({
    orgId,
    actorId: userId,
    action: "billing.subscription_canceled",
    entityType: "Subscription",
    entityId: orgId,
    metadata: { atPeriodEnd: params.atPeriodEnd },
  });
  return {
    success: true,
    data: { status: params.atPeriodEnd ? "scheduled_for_cancel" : "canceled" },
  };
}

export async function pauseSubscriptionAction(params: {
  reason?: string;
}): Promise<ActionResult<{ status: string }>> {
  const { orgId, userId } = await requireRole("admin");

  await pauseSubscription(orgId, params.reason);
  await logAudit({
    orgId,
    actorId: userId,
    action: "billing.subscription_paused",
    entityType: "Subscription",
    entityId: orgId,
    metadata: { reason: params.reason ?? null },
  });
  return { success: true, data: { status: "paused" } };
}

export async function resumeSubscriptionAction(): Promise<ActionResult<{ status: string }>> {
  const { orgId, userId } = await requireRole("admin");

  await resumeSubscription(orgId);
  await logAudit({
    orgId,
    actorId: userId,
    action: "billing.subscription_resumed",
    entityType: "Subscription",
    entityId: orgId,
  });
  return { success: true, data: { status: "active" } };
}

export async function getBillingDashboardData(): Promise<ActionResult<{
  subscription: {
    planId: string;
    status: string;
    billingInterval: string | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    trialEndsAt: Date | null;
  } | null;
  billingAccount: {
    gateway: string;
    billingEmail: string;
    billingCountry: string;
    currency: string;
  } | null;
  usage: Record<string, number>;
  recentInvoices: Array<{
    id: string;
    amountPaise: bigint;
    periodStart: Date;
    periodEnd: Date;
    status: string;
  }>;
  dunningStatus: {
    attemptNumber: number;
    scheduledDay: number;
    willCancel: boolean;
  } | null;
}>> {
  const { orgId } = await requireOrgContext();

  const [subscription, billingAccount, usage, invoiceData] = await Promise.all([
    db.subscription.findUnique({
      where: { orgId },
      select: {
        planId: true,
        status: true,
        billingInterval: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        trialEndsAt: true,
        id: true,
      },
    }),
    db.billingAccount.findUnique({
      where: { orgId },
      select: { gateway: true, billingEmail: true, billingCountry: true, currency: true },
    }),
    getCurrentUsage(orgId),
    listBillingInvoices(1, 5),
  ]);

  let dunningStatus = null;
  if (subscription?.status === "past_due") {
    dunningStatus = await getNextDunningAttempt(subscription.id);
  }

  return {
    success: true,
    data: {
      subscription: subscription
        ? {
            planId: subscription.planId,
            status: subscription.status,
            billingInterval: subscription.billingInterval,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            trialEndsAt: subscription.trialEndsAt,
          }
        : null,
      billingAccount: billingAccount
        ? {
            gateway: billingAccount.gateway,
            billingEmail: billingAccount.billingEmail,
            billingCountry: billingAccount.billingCountry,
            currency: billingAccount.currency,
          }
        : null,
      usage,
      recentInvoices: invoiceData.invoices.map((inv) => ({
        id: inv.id,
        amountPaise: inv.amountPaise,
        periodStart: inv.periodStart,
        periodEnd: inv.periodEnd,
        status: inv.status,
      })),
      dunningStatus,
    },
  };
}

export async function getBillingEventsAction(page: number = 1): Promise<ActionResult<{
  events: Array<{
    id: string;
    type: string;
    amount: bigint | null;
    currency: string | null;
    createdAt: Date;
  }>;
  total: number;
}>> {
  const { orgId } = await requireOrgContext();

  const account = await db.billingAccount.findUnique({ where: { orgId } });
  if (!account) {
    return { success: true, data: { events: [], total: 0 } };
  }

  const pageSize = 20;
  const [events, total] = await Promise.all([
    db.billingEvent.findMany({
      where: { billingAccountId: account.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, type: true, amount: true, currency: true, createdAt: true },
    }),
    db.billingEvent.count({ where: { billingAccountId: account.id } }),
  ]);

  return { success: true, data: { events, total } };
}

export async function verifyCheckoutAction(): Promise<ActionResult<{ success: boolean }>> {
  const { orgId } = await requireOrgContext();
  const sub = await db.subscription.findUnique({ where: { orgId } });
  
  if (!sub || !sub.razorpaySubId || sub.status === "active") {
    return { success: true, data: { success: true } };
  }

  try {
    const { fetchRazorpaySubscription } = await import("@/lib/billing/razorpay");
    const rzpSub = await fetchRazorpaySubscription(sub.razorpaySubId);

    if (rzpSub && rzpSub.status === "active") {
      const { getInternalPlanIdForRazorpayPlanId } = await import("@/lib/billing");
      const internalPlanId = getInternalPlanIdForRazorpayPlanId(rzpSub.plan_id);
      
      await db.subscription.update({
        where: { orgId },
        data: {
          status: "active",
          ...(internalPlanId ? { planId: internalPlanId } : {}),
          razorpayPlanId: rzpSub.plan_id,
          razorpayCustomerId: rzpSub.customer_id,
          currentPeriodStart: rzpSub.current_start ? new Date(rzpSub.current_start * 1000) : undefined,
          currentPeriodEnd: rzpSub.current_end ? new Date(rzpSub.current_end * 1000) : undefined,
        }
      });
    }
  } catch (error) {
    console.error("[Billing] Failed to verify checkout:", error);
  }

  return { success: true, data: { success: true } };
}
