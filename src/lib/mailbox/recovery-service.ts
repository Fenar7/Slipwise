import "server-only";

/**
 * Sprint 3.4 — Manual support recovery actions contract.
 *
 * This module implements the backend contract for admin/support recovery
 * actions on a mailbox connection. It is NOT a full admin UI; it is the
 * service layer that a later admin UI will call.
 *
 * Rules:
 * - Every function is org-scoped and permission-safe.
 * - Every significant action emits an audit event.
 * - No credentials or token refs are exposed in return shapes.
 * - Recovery actions are deterministic: unsupported combinations are rejected.
 */

import { db } from "@/lib/db";
import { getMailboxConnection } from "./connection-service";
import { getMailboxCursor, deleteMailboxCursors } from "./cursor-service";
import { runMailboxSync } from "./mailbox-sync-service";
import { refreshGmailAuthorization, verifyGmailConnection } from "./gmail-oauth-service";
import { logMailboxAudit } from "./audit";
import { findMailboxProviderAdapter } from "./provider-registry";
import {
  classifyProviderError,
  resolveRecoveryAction,
  isRetryAllowed,
  isReplayRequired,
  isReconnectRequired,
  resolveRecoverySyncMode,
} from "./sync-failure-model";
import type { MailboxSyncFailureClass, MailboxRecoveryAction } from "./sync-failure-model";
import type { MailboxConnectionRecord, MailboxSyncMode } from "./domain-types";
import { mailboxCanSync } from "./domain-types";

// ─── Recovery status shape ────────────────────────────────────────────────────

export interface MailboxRecoveryStatus {
  connectionId: string;
  orgId: string;
  /** The current connection status. */
  connectionStatus: MailboxConnectionRecord["status"];
  /** The classified failure class from the last sync error, if any. */
  lastErrorCategory: MailboxSyncFailureClass | null;
  /** The recommended recovery action. */
  recoveryAction: MailboxRecoveryAction;
  /** Whether retrying sync is expected to be safe. */
  canRetry: boolean;
  /** Whether a full replay (cursor reset + initial sync) is required. */
  replayRequired: boolean;
  /** Whether re-authorization is required. */
  reconnectRequired: boolean;
  /** Whether the connection is currently syncing. */
  isSyncing: boolean;
  /** Safe human-readable summary for admin UI. */
  summary: string;
}

// ─── Recovery action result shapes ────────────────────────────────────────────

export type RecoveryActionType = "retry" | "replay" | "verify_auth";

export interface RecoveryActionResult {
  ok: boolean;
  action: RecoveryActionType;
  /** Safe message for UI display. */
  message: string;
  /** Sync result if a sync was triggered. */
  syncResult?: {
    runId: string;
    success: boolean;
    syncMode: MailboxSyncMode;
    errorCategory?: string;
  };
}

// ─── Recovery status query ────────────────────────────────────────────────────

/**
 * Get the recovery status for a mailbox connection.
 *
 * Org-safe: returns null if the connection does not belong to the org.
 */
export async function getMailboxRecoveryStatus(
  orgId: string,
  connectionId: string,
): Promise<MailboxRecoveryStatus | null> {
  const connection = await getMailboxConnection(orgId, connectionId);
  if (!connection) {
    return null;
  }

  const lastErrorCategory: MailboxSyncFailureClass | null =
    connection.lastSyncErrorCategory
      ? classifyProviderError(connection.lastSyncErrorCategory as MailboxSyncFailureClass)
      : null;

  const recoveryAction = lastErrorCategory
    ? resolveRecoveryAction(lastErrorCategory)
    : connection.status === "RECONNECT_REQUIRED"
      ? "reconnect"
      : "none";

  const isSyncing =
    connection.syncLeaseExpiresAt !== null &&
    connection.syncLeaseExpiresAt.getTime() > Date.now();

  let summary: string;
  if (connection.status === "RECONNECT_REQUIRED") {
    summary = "Mailbox authorization has expired. Please reconnect.";
  } else if (connection.status === "DEGRADED" && lastErrorCategory) {
    summary = getFailureSummary(lastErrorCategory);
  } else if (connection.status === "DISCONNECTED") {
    summary = "Mailbox is disconnected.";
  } else if (isSyncing) {
    summary = "Mailbox sync is currently in progress.";
  } else {
    summary = "Mailbox is healthy.";
  }

  return {
    connectionId: connection.id,
    orgId: connection.orgId,
    connectionStatus: connection.status,
    lastErrorCategory,
    recoveryAction,
    canRetry: lastErrorCategory ? isRetryAllowed(lastErrorCategory) : false,
    replayRequired: lastErrorCategory ? isReplayRequired(lastErrorCategory) : false,
    reconnectRequired:
      connection.status === "RECONNECT_REQUIRED" ||
      (lastErrorCategory ? isReconnectRequired(lastErrorCategory) : false),
    isSyncing,
    summary,
  };
}

// ─── Recovery actions ─────────────────────────────────────────────────────────

export interface PerformRecoveryActionParams {
  orgId: string;
  connectionId: string;
  actorId: string;
  action: RecoveryActionType;
}

/**
 * Perform a recovery action on a mailbox connection.
 *
 * Org-safe: verifies ownership before any mutation.
 * Audit: emits ADMIN_SUPPORT_ACTION for every invocation.
 *
 * Rejected combinations:
 * - retry on auth_expired / auth_insufficient → error (must reconnect)
 * - retry on cursor_invalid → error (must replay)
 * - replay on auth_expired / auth_insufficient → error (must reconnect)
 * - verify_auth when tokenRef is missing → error
 */
export async function performMailboxRecoveryAction(
  params: PerformRecoveryActionParams,
): Promise<RecoveryActionResult> {
  const { orgId, connectionId, actorId, action } = params;

  const connection = await getMailboxConnection(orgId, connectionId);
  if (!connection) {
    throw new Error(`MailboxConnection ${connectionId} not found for org ${orgId}`);
  }

  const status = await getMailboxRecoveryStatus(orgId, connectionId);
  if (!status) {
    throw new Error(`MailboxConnection ${connectionId} not found for org ${orgId}`);
  }

  await logMailboxAudit({
    orgId,
    actorId,
    action: "ADMIN_SUPPORT_ACTION",
    summary: `Recovery action '${action}' requested for mailbox`,
    mailboxConnectionId: connectionId,
    metadata: { recoveryAction: action, previousStatus: connection.status },
  });

  switch (action) {
    case "retry": {
      return handleRetrySync(connection, status, orgId, actorId);
    }
    case "replay": {
      return handleForceReplay(connection, status, orgId, actorId);
    }
    case "verify_auth": {
      return handleVerifyAuth(connection, orgId, actorId);
    }
    default: {
      throw new Error(`Unsupported recovery action: ${action}`);
    }
  }
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function handleRetrySync(
  connection: MailboxConnectionRecord,
  status: MailboxRecoveryStatus,
  orgId: string,
  actorId: string,
): Promise<RecoveryActionResult> {
  if (status.reconnectRequired) {
    return {
      ok: false,
      action: "retry",
      message: "Cannot retry sync because the mailbox requires reconnection. Please reconnect first.",
    };
  }

  if (status.replayRequired) {
    return {
      ok: false,
      action: "retry",
      message: "Cannot retry sync because the sync cursor is invalid. Please run a full replay instead.",
    };
  }

  if (!isRetryAllowed(status.lastErrorCategory ?? "unknown") && connection.status !== "ACTIVE") {
    return {
      ok: false,
      action: "retry",
      message: "Retry is not safe for the current failure state. Please review the error or contact support.",
    };
  }

  if (status.isSyncing) {
    return {
      ok: false,
      action: "retry",
      message: "A sync is already running for this mailbox. Please wait for it to complete.",
    };
  }

  const recAdapter = findMailboxProviderAdapter(connection.provider);
  const recCursorType = recAdapter?.descriptor.syncCursorType ?? "HISTORY_ID";
  const cursor = await getMailboxCursor(orgId, connection.id, recCursorType);
  const previousMode: MailboxSyncMode = cursor ? "DELTA" : "INITIAL";
  const syncMode = resolveRecoverySyncMode("retry", previousMode);

  const syncResult = await runMailboxSync({
    orgId,
    connectionId: connection.id,
    actorId,
    triggerSource: "MANUAL",
    syncMode,
  });

  return {
    ok: syncResult.success,
    action: "retry",
    message: syncResult.success
      ? "Sync retry completed successfully."
      : `Sync retry failed: ${syncResult.error?.summary ?? "Unknown error"}`,
    syncResult: {
      runId: syncResult.runId,
      success: syncResult.success,
      syncMode: syncResult.syncMode,
      errorCategory: syncResult.error?.category,
    },
  };
}

async function handleForceReplay(
  connection: MailboxConnectionRecord,
  status: MailboxRecoveryStatus,
  orgId: string,
  actorId: string,
): Promise<RecoveryActionResult> {
  if (status.reconnectRequired) {
    return {
      ok: false,
      action: "replay",
      message: "Cannot replay sync because the mailbox requires reconnection. Please reconnect first.",
    };
  }

  if (status.isSyncing) {
    return {
      ok: false,
      action: "replay",
      message: "A sync is already running for this mailbox. Please wait for it to complete before replaying.",
    };
  }

  // Deterministic cursor reset before replay.
  await deleteMailboxCursors(orgId, connection.id);

  await logMailboxAudit({
    orgId,
    actorId,
    action: "ADMIN_SUPPORT_ACTION",
    summary: "Force replay: cleared sync cursor for full resync",
    mailboxConnectionId: connection.id,
    metadata: { recoveryAction: "replay", previousCursor: status.replayRequired },
  });

  const syncResult = await runMailboxSync({
    orgId,
    connectionId: connection.id,
    actorId,
    triggerSource: "MANUAL",
    syncMode: "INITIAL",
  });

  return {
    ok: syncResult.success,
    action: "replay",
    message: syncResult.success
      ? "Full replay completed successfully."
      : `Full replay failed: ${syncResult.error?.summary ?? "Unknown error"}`,
    syncResult: {
      runId: syncResult.runId,
      success: syncResult.success,
      syncMode: syncResult.syncMode,
      errorCategory: syncResult.error?.category,
    },
  };
}

async function handleVerifyAuth(
  connection: MailboxConnectionRecord,
  orgId: string,
  actorId: string,
): Promise<RecoveryActionResult> {
  if (!connection.tokenRef) {
    return {
      ok: false,
      action: "verify_auth",
      message: "Connection has no stored credentials. Reconnection is required.",
    };
  }

  if (connection.provider === "GMAIL") {
    // Attempt token refresh first.
    const refreshResult = await refreshGmailAuthorization({
      orgId,
      connectionId: connection.id,
      tokenRef: connection.tokenRef,
      actorId,
    });

    if (refreshResult.ok) {
      return {
        ok: true,
        action: "verify_auth",
        message: "Authorization refreshed successfully.",
      };
    }

    if (refreshResult.reconnectRequired) {
      return {
        ok: false,
        action: "verify_auth",
        message: "Authorization has expired and cannot be refreshed. Please reconnect.",
      };
    }

    // Refresh failed but not definitively expired; try verify.
    const verifyResult = await verifyGmailConnection({
      orgId,
      connectionId: connection.id,
      tokenRef: connection.tokenRef,
      actorId,
    });

    if (verifyResult.ok) {
      return {
        ok: true,
        action: "verify_auth",
        message: "Authorization is valid.",
      };
    }

    if (verifyResult.reconnectRequired) {
      return {
        ok: false,
        action: "verify_auth",
        message: "Authorization is no longer valid. Please reconnect.",
      };
    }

    return {
      ok: false,
      action: "verify_auth",
      message: "Authorization check failed. Please try again or contact support.",
    };
  }

  return {
    ok: false,
    action: "verify_auth",
    message: "Authorization verification is not supported for this provider.",
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFailureSummary(failureClass: MailboxSyncFailureClass): string {
  switch (failureClass) {
    case "auth_expired":
      return "Authorization expired during last sync.";
    case "auth_insufficient":
      return "Authorization is missing required permissions.";
    case "cursor_invalid":
      return "Sync history expired. A full resync is required.";
    case "transient":
      return "A temporary provider error occurred during last sync.";
    case "rate_limited":
      return "Provider rate limit was reached during last sync.";
    case "unknown":
      return "An unexpected error occurred during last sync.";
    default:
      return "Sync failure.";
  }
}
