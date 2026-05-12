import "server-only";

import { db } from "@/lib/db";
import { getOrgPlan } from "@/lib/plans/enforcement";
import { UsageResource } from "@/generated/prisma/client";

export type UsageResourceKey = keyof typeof UsageResource;

export interface UsageLimitResult {
  allowed: boolean;
  current: number;
  /** null = unlimited */
  limit: number | null;
  resource: UsageResourceKey;
}

/**
 * Maps UsageResource enum keys to their OrgUsageSnapshot column names.
 * Columns not present here have no snapshot-based limit.
 */
const SNAPSHOT_FIELD_MAP: Partial<Record<UsageResourceKey, string>> = {
  INVOICE: "activeInvoices",
  QUOTE: "activeQuotes",
  VOUCHER: "vouchers",
  SALARY_SLIP: "salarySlips",
  FILE_STORAGE_BYTES: "storageBytes",
  TEAM_MEMBER: "teamMembers",
  WEBHOOK_CALL: "webhookCallsMonthly",
  PORTAL_SESSION: "activePortalSessions",
  SHARE_BUNDLE: "activeShareBundles",
  PIXEL_JOB_SAVED: "pixelJobsSaved",
};

/**
 * Maps UsageResource enum keys to their PlanLimits field names.
 */
const PLAN_LIMIT_FIELD_MAP: Partial<Record<UsageResourceKey, string>> = {
  INVOICE: "invoicesPerMonth",
  QUOTE: "quotesPerMonth",
  VOUCHER: "vouchersPerMonth",
  SALARY_SLIP: "salarySlipsPerMonth",
  FILE_STORAGE_BYTES: "storageBytes",
  TEAM_MEMBER: "teamMembers",
  PORTAL_SESSION: "activePortalSessions",
  SHARE_BUNDLE: "activeShareBundles",
  PIXEL_JOB_SAVED: "pixelJobsSaved",
};

function currentPeriodBounds(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Returns the current snapshot for the org, computing it on-demand if absent.
 * Fast read path for enforcement and the dashboard.
 */
function normalizeBigInts<T extends Record<string, unknown>>(obj: T): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "bigint") {
      out[key] = Number(value);
    } else if (typeof value === "number") {
      out[key] = value;
    } else {
      out[key] = Number(value) || 0;
    }
  }
  return out;
}

export async function getOrComputeSnapshot(orgId: string): Promise<Record<string, number>> {
  const { start } = currentPeriodBounds();

  const existing = await db.orgUsageSnapshot.findFirst({
    where: { orgId, periodStart: start },
    orderBy: { lastComputedAt: "desc" },
  });

  if (existing) {
    return normalizeBigInts(existing);
  }

  return computeAndUpsertSnapshot(orgId, start);
}

/**
 * Aggregates current usage from source tables and upserts a snapshot record.
 * Called by the nightly cron job and on-demand when no snapshot exists.
 */
export async function computeAndUpsertSnapshot(
  orgId: string,
  periodStart?: Date
): Promise<Record<string, number>> {
  const { start, end } = currentPeriodBounds();
  const ps = periodStart ?? start;

  const [
    activeInvoices,
    activeQuotes,
    vouchers,
    salarySlips,
    storageAggregate,
    teamMembers,
    webhookCallsMonthly,
    activePortalSessions,
    activeShareBundles,
    pixelJobsSaved,
  ] = await Promise.all([
    db.invoice.count({ where: { organizationId: orgId, status: { notIn: ["PAID", "CANCELLED"] } } }),
    db.quote.count({ where: { orgId, status: { notIn: ["ACCEPTED", "DECLINED", "EXPIRED", "CONVERTED"] } } }),
    db.voucher.count({ where: { organizationId: orgId } }),
    db.salarySlip.count({ where: { organizationId: orgId } }),
    db.fileAttachment.aggregate({
      where: { organizationId: orgId },
      _sum: { size: true },
    }),
    db.member.count({ where: { organizationId: orgId } }),
    db.usageEvent.count({
      where: { orgId, resource: "WEBHOOK_CALL", recordedAt: { gte: start, lte: end } },
    }),
    db.customerPortalSession.count({
      where: { orgId, revokedAt: null, expiresAt: { gt: new Date() } },
    }),
    db.shareBundle.count({
      where: { orgId, revokedAt: null },
    }),
    db.pixelJobRecord.count({ where: { orgId, storagePath: { not: null } } }),
  ]);

  const storageBytes = Number(storageAggregate._sum.size ?? 0);

  const data = {
    activeInvoices: Number(activeInvoices),
    activeQuotes: Number(activeQuotes),
    vouchers: Number(vouchers),
    salarySlips: Number(salarySlips),
    storageBytes,
    teamMembers: Number(teamMembers),
    webhookCallsMonthly: Number(webhookCallsMonthly),
    activePortalSessions: Number(activePortalSessions),
    activeShareBundles: Number(activeShareBundles),
    pixelJobsSaved: Number(pixelJobsSaved),
    lastComputedAt: new Date(),
    periodEnd: end,
  };

  await db.orgUsageSnapshot.upsert({
    where: { orgId_periodStart: { orgId, periodStart: ps } },
    create: { orgId, periodStart: ps, ...data },
    update: data,
  });

  return normalizeBigInts(data);
}

function resolvePlanLimit(
  limits: Record<string, unknown>,
  resource: UsageResourceKey
): number | null {
  const key = PLAN_LIMIT_FIELD_MAP[resource];
  if (!key) return null;
  const v = limits[key];
  if (v === undefined || v === null) return null;
  const n = Number(v);
  // -1 and Infinity are both "unlimited" conventions in PlanLimits
  if (!isFinite(n) || n < 0) return null;
  return n;
}

/**
 * Checks whether an org is within its plan limit for a given resource.
 *
 * Reads from OrgUsageSnapshot (computed on-demand if absent).
 * Returns `{ allowed, current, limit }` — limit is null for unlimited resources.
 */
export async function checkUsageLimit(
  orgId: string,
  resource: UsageResourceKey
): Promise<UsageLimitResult> {
  const [snapshot, { limits }] = await Promise.all([
    getOrComputeSnapshot(orgId),
    getOrgPlan(orgId),
  ]);

  const snapshotField = SNAPSHOT_FIELD_MAP[resource];
  const current = snapshotField ? Number(snapshot[snapshotField] ?? 0) : 0;
  const limit = resolvePlanLimit(limits as unknown as Record<string, unknown>, resource);

  const allowed = limit === null || current < limit;
  return { allowed, current, limit, resource };
}

/**
 * Records an append-only usage event.
 * delta: +1 for creation, -1 for deletion/archival.
 */
export async function recordUsageEvent(
  orgId: string,
  resource: UsageResourceKey,
  delta: 1 | -1,
  entityId?: string
): Promise<void> {
  await db.usageEvent.create({
    data: { orgId, resource, delta, entityId },
  });
}
