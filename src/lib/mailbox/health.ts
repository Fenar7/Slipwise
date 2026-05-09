import "server-only";

import type { MailboxConnectionRecord } from "./domain-types";

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
}

export const EXPIRING_SOON_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function deriveMailboxHealth(
  connection: MailboxConnectionRecord,
  now = Date.now(),
): MailboxConnectionHealth {
  const tokenExpiresAt = connection.tokenExpiry?.toISOString() ?? null;

  switch (connection.status) {
    case "RECONNECT_REQUIRED":
      return {
        status: "reconnect_required",
        summary: "Mailbox authorization has expired. Reconnect required.",
        actionRequired: true,
        tokenExpiresAt,
      };
    case "DEGRADED":
      return {
        status: "degraded",
        summary: "Mailbox connection is experiencing issues.",
        actionRequired: true,
        tokenExpiresAt,
      };
    case "DISCONNECTED":
      return {
        status: "disconnected",
        summary: "Mailbox has been disconnected.",
        actionRequired: false,
        tokenExpiresAt: null,
      };
    case "ACTIVE": {
      const isExpiringSoon =
        connection.tokenExpiry !== null &&
        connection.tokenExpiry.getTime() - now < EXPIRING_SOON_THRESHOLD_MS &&
        connection.tokenExpiry.getTime() > now;
      if (isExpiringSoon) {
        return {
          status: "expiring_soon",
          summary: "Access token is expiring soon. Token refresh recommended.",
          actionRequired: true,
          tokenExpiresAt,
        };
      }
      return {
        status: "healthy",
        summary: "Mailbox is connected and active.",
        actionRequired: false,
        tokenExpiresAt,
      };
    }
    default:
      return {
        status: "disconnected",
        summary: "Unknown mailbox state.",
        actionRequired: false,
        tokenExpiresAt: null,
      };
  }
}
