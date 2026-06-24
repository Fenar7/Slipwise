import "server-only";

import { db } from "@/lib/db";
import { isSchemaDriftError } from "@/lib/prisma-errors";

// ─── Return types ─────────────────────────────────────────────────────────────

/** Counts of mailbox connections by status and provider. */
export interface MailboxAdoptionMetrics {
  /** Total non-deleted connections for the org. */
  totalConnections: number;
  /** Connections currently in ACTIVE status. */
  activeConnections: number;
  /** Connections currently in DEGRADED status. */
  degradedConnections: number;
  /** Connections currently in DISCONNECTED status. */
  disconnectedConnections: number;
  /** Connections currently in RECONNECT_REQUIRED status. */
  reconnectRequiredConnections: number;
  /** Connections with `disabledAt` set (soft-disabled). */
  disabledConnections: number;
  /** Count of distinct users who have connected at least one mailbox. */
  uniqueConnectedUsers: number;
  /** Connection counts grouped by provider name. */
  byProvider: Record<string, number>;
  /**
   * Connections that completed at least one sync successfully in the last 7
   * days (based on lastSyncAt and absence of lastSyncError).
   */
  recentlySyncedConnections: number;
  /**
   * Connections that have a lastSyncError set and lastSyncAt within the last
   * 7 days — i.e. recently attempted and failed.
   */
  recentlyFailedConnections: number;
}

/** Aggregate sync performance and reliability metrics over a time window. */
export interface MailboxHealthMetrics {
  /** Inclusive start of the time window used for these metrics. */
  windowStart: Date;
  /** Exclusive end of the time window (always "now"). */
  windowEnd: Date;
  /** Total sync runs started in the window. */
  totalRuns: number;
  /** Runs that completed successfully. */
  completedRuns: number;
  /** Runs that failed. */
  failedRuns: number;
  /** Runs still marked RUNNING but started more than 30 minutes ago (stalled). */
  stalledRuns: number;
  /**
   * Success rate as a decimal in [0, 1]. 0 when no runs exist in the window.
   */
  successRate: number;
  /** In-millisecond latency stats across COMPLETED runs in the window. */
  latencyMs: {
    /** Average duration, or 0 when no completed runs. */
    avg: number;
    /** 50th-percentile duration, or 0 when no completed runs. */
    p50: number;
    /** 90th-percentile duration, or 0 when no completed runs. */
    p90: number;
  };
  /** Error category counts from FAILED runs in the window. */
  errorsByCategory: Record<string, number>;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const STALL_THRESHOLD_MINUTES = 30;
const STALL_THRESHOLD_MS = STALL_THRESHOLD_MINUTES * 60 * 1000;

/**
 * Computes an approximate percentile value from a sorted numeric array using
 * the nearest-rank method.  Returns 0 for an empty array.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/** Returns the arithmetic mean of an array, or 0 for an empty array. */
function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns adoption-level metrics for the org's mailbox connections.
 *
 * All queries are wrapped with schema-drift guards so that a missing Prisma
 * model (e.g. before `prisma migrate deploy` has been run) returns safe
 * default values instead of crashing.
 *
 * @param orgId - The organisation ID to scope all queries to.
 */
export async function getMailboxAdoptionMetrics(
  orgId: string,
): Promise<MailboxAdoptionMetrics> {
  const defaultMetrics: MailboxAdoptionMetrics = {
    totalConnections: 0,
    activeConnections: 0,
    degradedConnections: 0,
    disconnectedConnections: 0,
    reconnectRequiredConnections: 0,
    disabledConnections: 0,
    uniqueConnectedUsers: 0,
    byProvider: {},
    recentlySyncedConnections: 0,
    recentlyFailedConnections: 0,
  };

  if (!db.mailboxConnection) return defaultMetrics;

  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);

  let connections: Array<{
    status: string;
    provider: string;
    disabledAt: Date | null;
    deletedAt: Date | null;
    connectedBy: string;
    lastSyncAt: Date | null;
    lastSyncError: string | null;
  }>;

  try {
    connections = await db.mailboxConnection.findMany({
      where: { orgId, deletedAt: null },
      select: {
        status: true,
        provider: true,
        disabledAt: true,
        deletedAt: true,
        connectedBy: true,
        lastSyncAt: true,
        lastSyncError: true,
      },
    });
  } catch (error) {
    if (isSchemaDriftError(error)) {
      console.warn(
        "[mailbox/metrics] getMailboxAdoptionMetrics skipped — schema drift detected. Run prisma migrate deploy.",
      );
      return defaultMetrics;
    }
    throw error;
  }

  // Aggregate in-memory — avoids multiple round-trips and lets us compute
  // derived fields (e.g. disabledAt) that are hard to express in Prisma counts.
  let active = 0;
  let degraded = 0;
  let disconnected = 0;
  let reconnectRequired = 0;
  let disabled = 0;
  let recentlySynced = 0;
  let recentlyFailed = 0;
  const byProvider: Record<string, number> = {};
  const uniqueUsers = new Set<string>();

  for (const conn of connections) {
    uniqueUsers.add(conn.connectedBy);
    byProvider[conn.provider] = (byProvider[conn.provider] ?? 0) + 1;

    if (conn.disabledAt) {
      disabled++;
    } else {
      switch (conn.status) {
        case "ACTIVE":
          active++;
          break;
        case "DEGRADED":
          degraded++;
          break;
        case "DISCONNECTED":
          disconnected++;
          break;
        case "RECONNECT_REQUIRED":
          reconnectRequired++;
          break;
      }
    }

    // Recent sync health — only consider syncs in the last 7 days.
    if (conn.lastSyncAt && conn.lastSyncAt >= sevenDaysAgo) {
      if (!conn.lastSyncError) {
        recentlySynced++;
      } else {
        recentlyFailed++;
      }
    }
  }

  return {
    totalConnections: connections.length,
    activeConnections: active,
    degradedConnections: degraded,
    disconnectedConnections: disconnected,
    reconnectRequiredConnections: reconnectRequired,
    disabledConnections: disabled,
    uniqueConnectedUsers: uniqueUsers.size,
    byProvider,
    recentlySyncedConnections: recentlySynced,
    recentlyFailedConnections: recentlyFailed,
  };
}

/**
 * Returns health metrics (success rate, latency percentiles, stalled runs,
 * error breakdown) for mailbox sync runs in the given time window.
 *
 * @param orgId   - The organisation ID to scope all queries to.
 * @param options - Optional override for the window start date.
 *                  Defaults to 7 days ago when omitted.
 */
export async function getMailboxHealthMetrics(
  orgId: string,
  options?: { startDate?: Date },
): Promise<MailboxHealthMetrics> {
  const windowEnd = new Date();
  const windowStart = options?.startDate ?? new Date(Date.now() - SEVEN_DAYS_MS);
  const stallCutoff = new Date(Date.now() - STALL_THRESHOLD_MS);

  const defaultMetrics: MailboxHealthMetrics = {
    windowStart,
    windowEnd,
    totalRuns: 0,
    completedRuns: 0,
    failedRuns: 0,
    stalledRuns: 0,
    successRate: 0,
    latencyMs: { avg: 0, p50: 0, p90: 0 },
    errorsByCategory: {},
  };

  if (!db.mailboxSyncRun) return defaultMetrics;

  let runs: Array<{
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    errorCategory: string | null;
    lastHeartbeatAt: Date | null;
  }>;

  try {
    runs = await db.mailboxSyncRun.findMany({
      where: {
        orgId,
        startedAt: { gte: windowStart },
      },
      select: {
        status: true,
        startedAt: true,
        completedAt: true,
        errorCategory: true,
        lastHeartbeatAt: true,
      },
    });
  } catch (error) {
    if (isSchemaDriftError(error)) {
      console.warn(
        "[mailbox/metrics] getMailboxHealthMetrics skipped — schema drift detected. Run prisma migrate deploy.",
      );
      return defaultMetrics;
    }
    throw error;
  }

  let completed = 0;
  let failed = 0;
  let stalled = 0;
  const latencies: number[] = [];
  const errorsByCategory: Record<string, number> = {};

  for (const run of runs) {
    switch (run.status) {
      case "COMPLETED": {
        completed++;
        if (run.completedAt) {
          latencies.push(run.completedAt.getTime() - run.startedAt.getTime());
        }
        break;
      }
      case "FAILED": {
        failed++;
        if (run.errorCategory) {
          errorsByCategory[run.errorCategory] =
            (errorsByCategory[run.errorCategory] ?? 0) + 1;
        }
        break;
      }
      case "RUNNING": {
        // A RUNNING run is stalled if neither the run start nor the last
        // heartbeat is recent enough.  The heartbeat is preferred when set.
        const lastActivity = run.lastHeartbeatAt ?? run.startedAt;
        if (lastActivity < stallCutoff) {
          stalled++;
        }
        break;
      }
    }
  }

  const total = runs.length;
  const successRate = total > 0 ? completed / total : 0;

  // Sort ascending for percentile calculation.
  latencies.sort((a, b) => a - b);

  return {
    windowStart,
    windowEnd,
    totalRuns: total,
    completedRuns: completed,
    failedRuns: failed,
    stalledRuns: stalled,
    successRate,
    latencyMs: {
      avg: average(latencies),
      p50: percentile(latencies, 50),
      p90: percentile(latencies, 90),
    },
    errorsByCategory,
  };
}
