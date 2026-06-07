import "server-only";

import { db } from "@/lib/db";
import { upsertInsight } from "@/lib/intel/insights";
import type { ExternalAccessEventType } from "@/generated/prisma/client";

// ─── External access event recording ─────────────────────────────────────────

export interface RecordExternalEventParams {
  orgId: string;
  customerId?: string;
  userId?: string;
  eventType: ExternalAccessEventType;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

/**
 * Append-only event recording for portal and share analytics.
 * Fails silently — never block the user's primary action.
 */
export async function recordExternalEvent(params: RecordExternalEventParams): Promise<void> {
  try {
    await db.externalAccessEvent.create({
      data: {
        orgId: params.orgId,
        customerId: params.customerId ?? null,
        userId: params.userId ?? null,
        eventType: params.eventType,
        resourceType: params.resourceType ?? null,
        resourceId: params.resourceId ?? null,
        metadata: params.metadata ? (params.metadata as import("@/generated/prisma/client").Prisma.InputJsonValue) : undefined,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  } catch {
    // Fire-and-forget analytics must never propagate errors
  }
}

// ─── Portal analytics rollup ──────────────────────────────────────────────────

export interface PortalAnalyticsSummary {
  totalLogins: number;
  totalInvoiceViews: number;
  totalQuoteDecisions: number;
  totalShareViews: number;
  totalProofUploads: number;
  unusualAccessCount: number;
  periodDays: number;
}

export async function getPortalAnalyticsSummary(
  orgId: string,
  periodDays = 30,
): Promise<PortalAnalyticsSummary> {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const [
    totalLogins,
    totalInvoiceViews,
    totalQuoteDecisions,
    totalShareViews,
    totalProofUploads,
    unusualAccessCount,
  ] = await Promise.all([
    db.externalAccessEvent.count({ where: { orgId, eventType: "PORTAL_LOGIN", createdAt: { gte: since } } }),
    db.externalAccessEvent.count({ where: { orgId, eventType: "INVOICE_VIEWED", createdAt: { gte: since } } }),
    db.externalAccessEvent.count({
      where: {
        orgId,
        eventType: { in: ["QUOTE_ACCEPTED", "QUOTE_DECLINED"] },
        createdAt: { gte: since },
      },
    }),
    db.externalAccessEvent.count({
      where: {
        orgId,
        eventType: { in: ["SHARE_VIEWED", "BUNDLE_VIEWED"] },
        createdAt: { gte: since },
      },
    }),
    db.externalAccessEvent.count({
      where: {
        orgId,
        eventType: "PROOF_UPLOADED",
        createdAt: { gte: since },
        NOT: {
          metadata: {
            path: ["isTicketAttachment"],
            equals: true,
          },
        },
      },
    }),
    db.externalAccessEvent.count({ where: { orgId, eventType: "UNUSUAL_ACCESS", createdAt: { gte: since } } }),
  ]);

  return {
    totalLogins,
    totalInvoiceViews,
    totalQuoteDecisions,
    totalShareViews,
    totalProofUploads,
    unusualAccessCount,
    periodDays,
  };
}

// ─── Intel signal feeder ──────────────────────────────────────────────────────

/**
 * Feed portal adoption signal into IntelInsight.
 * Fires when an org has had zero portal logins in the past 30 days but has portal enabled.
 */
export async function feedPortalAdoptionSignal(orgId: string): Promise<void> {
  try {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentLogins = await db.externalAccessEvent.count({
      where: { orgId, eventType: "PORTAL_LOGIN", createdAt: { gte: since30d } },
    });

    if (recentLogins > 0) return;

    const portalEnabled = await db.orgDefaults.findFirst({
      where: { organizationId: orgId },
      select: { portalEnabled: true },
    });

    if (!portalEnabled?.portalEnabled) return;

    await upsertInsight({
      orgId,
      category: "OPERATIONS",
      severity: "LOW",
      title: "Portal adoption: no logins in 30 days",
      summary:
        "Your client portal is enabled but no customers have logged in during the past 30 days. " +
        "Consider sending portal invitations to active customers.",
      sourceType: "RULE",
      sourceRecordType: "PortalAnalytics",
      dedupeKey: `portal-adoption:${orgId}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  } catch {
    // Intel signals are best-effort — never propagate
  }
}

/**
 * Feed unusual access signal into IntelInsight.
 * Fires when there are more than 10 UNUSUAL_ACCESS events for the org in the past 24 hours.
 */
export async function feedUnusualAccessSignal(orgId: string): Promise<void> {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await db.externalAccessEvent.count({
      where: { orgId, eventType: "UNUSUAL_ACCESS", createdAt: { gte: since24h } },
    });

    if (count < 10) return;

    await upsertInsight({
      orgId,
      category: "SYSTEM",
      severity: "HIGH",
      title: `Unusual portal access detected (${count} events)`,
      summary:
        `${count} unusual access events were recorded in the past 24 hours for this organization's portal. ` +
        "Review active sessions and consider revoking suspicious access.",
      sourceType: "RULE",
      sourceRecordType: "PortalAnalytics",
      dedupeKey: `unusual-access:${orgId}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  } catch {
    // Intel signals are best-effort
  }
}

/**
 * Feed overdue-unviewed invoice signal into IntelInsight.
 * Fires when there are overdue invoices that have never been viewed on the portal.
 */
export async function feedOverdueUnviewedInvoiceSignal(orgId: string): Promise<void> {
  try {
    const now = new Date();
    const overdueUnviewed = await db.externalAccessEvent.count({
      where: {
        orgId,
        eventType: "INVOICE_VIEWED",
      },
    });

    // Count invoices that are overdue
    const overdueInvoices = await db.invoice.count({
      where: {
        organizationId: orgId,
        status: { in: ["ISSUED", "VIEWED", "DUE", "PARTIALLY_PAID", "OVERDUE"] },
        dueDate: { lt: now.toISOString().slice(0, 10) },
      },
    });

    if (overdueInvoices === 0) return;

    // If no portal invoice views at all and there are overdue invoices, surface the signal
    if (overdueUnviewed === 0 && overdueInvoices > 0) {
      await upsertInsight({
        orgId,
        category: "RECEIVABLES",
        severity: "MEDIUM",
        title: `${overdueInvoices} overdue invoice${overdueInvoices > 1 ? "s" : ""} not viewed on portal`,
        summary:
          `${overdueInvoices} overdue invoice${overdueInvoices > 1 ? "s have" : " has"} not been viewed by ` +
          "customers through the portal. Share portal access with customers to improve payment visibility.",
        sourceType: "RULE",
        sourceRecordType: "Invoice",
        dedupeKey: `overdue-unviewed:${orgId}`,
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      });
    }
  } catch {
    // Intel signals are best-effort
  }
}
