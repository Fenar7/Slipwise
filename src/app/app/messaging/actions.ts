"use server";

/**
 * Messaging server actions — Sprint 7.4: task timeline and diagnostics.
 * These are the authorized server read paths that surface audit-backed data.
 */

import { requireOrgContext, requireRole } from "@/lib/auth";
import {
  getTaskActivityTimeline,
  getTaskHealthDiagnostics,
} from "@/lib/messaging/read-models";
import type { TimelineEvent } from "@/lib/messaging/read-models";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Get the activity timeline for a task.
 * Requires the caller to be an active participant in the task's conversation.
 * Returns null (not an error) when access is denied — no metadata leakage.
 */
export async function getTaskTimeline(
  taskId: string,
): Promise<ActionResult<TimelineEvent[] | null>> {
  try {
    const { orgId, userId } = await requireOrgContext();

    const timeline = await getTaskActivityTimeline(orgId, taskId, userId);

    return { success: true, data: timeline };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load task timeline",
    };
  }
}

/**
 * Get task health diagnostics for the current org.
 * Only accessible to org admins and owners.
 */
export async function getTaskDiagnostics(): Promise<ActionResult<{
  statusCounts: Record<string, number>;
  overdueCount: number;
  reminderDispatchedCount: number;
  reminderPendingCount: number;
} | null>> {
  try {
    const { orgId, userId } = await requireRole("admin");

    const diagnostics = await getTaskHealthDiagnostics(orgId, userId);

    return { success: true, data: diagnostics };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load task diagnostics",
    };
  }
}
