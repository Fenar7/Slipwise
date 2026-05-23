import "server-only";

import type { MailboxConnectionRecord } from "./domain-types";
import {
  classifyProviderError,
  resolveRecoveryAction,
  isRetryAllowed,
  isReplayRequired,
  isReconnectRequired,
  getFailureClassSummary,
} from "./sync-failure-model";
import type { MailboxSyncFailureClass, MailboxRecoveryAction } from "./sync-failure-model";
import type { MailboxProviderErrorCategory } from "./provider-contracts";

export type MailboxHealthStatus =
  | "healthy"
  | "expiring_soon"
  | "reconnect_required"
  | "degraded"
  | "disconnected";

export interface MailboxConnectionHealth {
  status: MailboxHealthStatus;
  /** Human-readable summary for admin UI display. */
  summary: string;
  /** True if the admin must take action (reconnect or review). */
  actionRequired: boolean;
  /** ISO string — when the current token expires. Null if unknown. */
  tokenExpiresAt: string | null;
  /** Classified failure class from the last sync error, if any. */
  lastErrorCategory: MailboxSyncFailureClass | null;
  /** The recommended recovery action for the current state. */
  recoveryAction: MailboxRecoveryAction;
  /** Whether retrying sync is expected to be safe. */
  canRetry: boolean;
  /** Whether a full replay (cursor reset + initial sync) is required. */
  replayRequired: boolean;
  /** Whether re-authorization is required. */
  reconnectRequired: boolean;
  /** Whether the connection is currently syncing (lease held). */
  isSyncing: boolean;
}

export const EXPIRING_SOON_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function deriveMailboxHealth(
  connection: MailboxConnectionRecord,
  now = Date.now(),
): MailboxConnectionHealth {
  const tokenExpiresAt = connection.tokenExpiry?.toISOString() ?? null;

  // Derive failure class from stored error category, if present.
  const lastErrorCategory: MailboxSyncFailureClass | null =
    connection.lastSyncErrorCategory
      ? classifyProviderError(connection.lastSyncErrorCategory as MailboxProviderErrorCategory)
      : null;

  const recoveryAction = lastErrorCategory
    ? resolveRecoveryAction(lastErrorCategory)
    : "none";

  const canRetry = lastErrorCategory ? isRetryAllowed(lastErrorCategory) : false;
  const replayRequired = lastErrorCategory ? isReplayRequired(lastErrorCategory) : false;
  const reconnectRequired =
    connection.status === "RECONNECT_REQUIRED" ||
    (lastErrorCategory ? isReconnectRequired(lastErrorCategory) : false);

  // A sync lease that has not expired implies an active sync.
  // Guard against undefined defensively — syncLeaseExpiresAt may be absent
  // on records constructed without the field (e.g. test stubs).
  const leaseExpiry = connection.syncLeaseExpiresAt ?? null;
  const isSyncing =
    leaseExpiry !== null &&
    leaseExpiry.getTime() > now;

  switch (connection.status) {
    case "RECONNECT_REQUIRED": {
      return {
        status: "reconnect_required",
        summary: "Mailbox authorization has expired. Reconnect required.",
        actionRequired: true,
        tokenExpiresAt,
        lastErrorCategory,
        recoveryAction: "reconnect",
        canRetry: false,
        replayRequired: false,
        reconnectRequired: true,
        isSyncing,
      };
    }
    case "DEGRADED": {
      const summary =
        lastErrorCategory && lastErrorCategory !== "unknown"
          ? getFailureClassSummary(lastErrorCategory)
          : "Mailbox connection is experiencing issues.";
      return {
        status: "degraded",
        summary,
        actionRequired: true,
        tokenExpiresAt,
        lastErrorCategory,
        recoveryAction,
        canRetry,
        replayRequired,
        reconnectRequired,
        isSyncing,
      };
    }
    case "DISCONNECTED": {
      return {
        status: "disconnected",
        summary: "Mailbox has been disconnected.",
        actionRequired: false,
        tokenExpiresAt: null,
        lastErrorCategory: null,
        recoveryAction: "none",
        canRetry: false,
        replayRequired: false,
        reconnectRequired: false,
        isSyncing: false,
      };
    }
    case "ACTIVE": {
      const tokenExpiryTime = connection.tokenExpiry?.getTime();
      const isExpiringSoon =
        tokenExpiryTime != null &&
        tokenExpiryTime - now < EXPIRING_SOON_THRESHOLD_MS &&
        tokenExpiryTime > now;

      if (isExpiringSoon) {
        return {
          status: "expiring_soon",
          summary: "Access token is expiring soon. Token refresh recommended.",
          actionRequired: true,
          tokenExpiresAt,
          lastErrorCategory: null,
          recoveryAction: "retry",
          canRetry: true,
          replayRequired: false,
          reconnectRequired: false,
          isSyncing,
        };
      }

      return {
        status: "healthy",
        summary: "Mailbox is connected and active.",
        actionRequired: false,
        tokenExpiresAt,
        lastErrorCategory: null,
        recoveryAction: "none",
        canRetry: false,
        replayRequired: false,
        reconnectRequired: false,
        isSyncing,
      };
    }
    default:
      return {
        status: "disconnected",
        summary: "Unknown mailbox state.",
        actionRequired: false,
        tokenExpiresAt: null,
        lastErrorCategory: null,
        recoveryAction: "none",
        canRetry: false,
        replayRequired: false,
        reconnectRequired: false,
        isSyncing: false,
      };
  }
}
