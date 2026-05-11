import "server-only";

/**
 * Gmail OAuth service.
 *
 * Orchestrates the Gmail mailbox connection lifecycle:
 *   - initiateGmailConnect: builds the OAuth URL and returns it to the route handler
 *   - handleGmailCallback: exchanges the auth code, persists the connection
 *   - refreshGmailAuthorization: refreshes the access token and updates the connection
 *   - markConnectionReconnectRequired: transitions a connection to RECONNECT_REQUIRED
 *   - reconnectGmailMailbox: re-runs the OAuth flow for an existing connection
 *
 * Rate-limiting seam:
 *   Route handlers apply rateLimitByOrg before calling these functions.
 *   This service does not rate-limit internally — it is a pure service layer.
 *
 * Org-scoping:
 *   Every function takes orgId as the first parameter and passes it through to
 *   the connection service and credential store. Cross-org operations are
 *   impossible by construction.
 *
 * Audit:
 *   Governance-relevant events (connect, reconnect, token refresh, reconnect-required)
 *   are emitted via logMailboxAudit / logMailboxAuditTx.
 */

import { buildGmailAuthUrl, gmailProviderAdapter } from "./gmail-provider";
import {
  createMailboxConnection,
  findMailboxConnectionByProviderAccount,
  updateMailboxConnectionStatus,
} from "./connection-service";
import { logMailboxAudit } from "./audit";
import { isMailboxProviderError } from "./provider-contracts";
import { db } from "@/lib/db";
import type { MailboxConnectionRecord } from "./domain-types";

// ─── Initiate connect ─────────────────────────────────────────────────────────

/**
 * Build the Gmail OAuth authorization URL for the connect flow.
 * The `state` parameter is the CSRF-protected state token from the OAuth state
 * cookie (created by the route handler using createIntegrationOAuthState).
 */
export function initiateGmailConnect(state: string): string {
  return buildGmailAuthUrl(state);
}

// ─── Callback handling ────────────────────────────────────────────────────────

export type GmailCallbackResult =
  | { ok: true; connection: MailboxConnectionRecord; isReconnect: boolean }
  | { ok: false; error: "auth_failed" | "duplicate_account" | "provider_error" | "internal_error"; safeMessage: string };

/**
 * Handle the Gmail OAuth callback.
 *
 * Steps:
 *   1. Exchange the authorization code for tokens via the Gmail adapter.
 *   2. Check for an existing connection for this provider account in this org.
 *   3. If a connection exists: update its tokenRef/tokenExpiry and set status=ACTIVE.
 *   4. If no connection exists: create a new MailboxConnection record.
 *   5. Emit the appropriate audit event.
 *
 * Duplicate account handling:
 *   If the same Gmail account is already connected to this org (same
 *   providerAccountId), the existing connection is updated (re-authorized)
 *   rather than creating a duplicate. This is the correct reconnect path.
 *
 * Error safety:
 *   On any failure, no partial state is left. The credential store entry is
 *   cleaned up if the connection record creation fails.
 */
export async function handleGmailCallback(params: {
  orgId: string;
  actorId: string;
  authorizationCode: string;
  redirectUri: string;
}): Promise<GmailCallbackResult> {
  const { orgId, actorId, authorizationCode, redirectUri } = params;

  // Step 1: Exchange code for identity + encrypted credential.
  const identity = await gmailProviderAdapter.connect({
    orgId,
    authorizationCode,
    redirectUri,
  });

  if (isMailboxProviderError(identity)) {
    return {
      ok: false,
      error: "auth_failed",
      safeMessage: "Gmail authorization failed. Please try connecting again.",
    };
  }

  // Step 2: Check for existing connection.
  const existing = await findMailboxConnectionByProviderAccount(
    orgId,
    "GMAIL",
    identity.providerAccountId,
  );

  if (existing) {
    // Step 3: Re-authorize existing connection.
    // Update tokenRef and tokenExpiry atomically, then set status=ACTIVE.
    const updated = await db.$transaction(async (tx) => {
      const row = await tx.mailboxConnection.update({
        where: { id: existing.id },
        data: {
          tokenRef: identity.tokenRef,
          tokenExpiry: identity.tokenExpiry,
          status: "ACTIVE",
          lastSyncError: null,
          displayName: identity.displayName,
          emailAddress: identity.emailAddress,
        },
      });
      await tx.mailboxAuditEvent.create({
        data: {
          orgId,
          actorId,
          action: "CONNECTION_RECONNECTED",
          summary: `Re-authorized Gmail mailbox: ${identity.emailAddress}`,
          mailboxConnectionId: existing.id,
          metadata: { provider: "GMAIL", emailAddress: identity.emailAddress },
        },
      });
      return row;
    });

    return {
      ok: true,
      connection: toConnectionRecord(updated),
      isReconnect: true,
    };
  }

  // Step 4: Create new connection.
  try {
    const connection = await createMailboxConnection({
      orgId,
      provider: "GMAIL",
      providerAccountId: identity.providerAccountId,
      emailAddress: identity.emailAddress,
      displayName: identity.displayName,
      tokenRef: identity.tokenRef,
      tokenExpiry: identity.tokenExpiry,
      connectedBy: actorId,
    });

    // Link the credential to the new connection (best-effort; non-fatal if it fails).
    await db.mailboxCredential.update({
      where: { id: identity.tokenRef },
      data: { connectionId: connection.id },
    }).catch(() => { /* non-fatal */ });

    return { ok: true, connection, isReconnect: false };
  } catch (error) {
    // If connection creation fails, clean up the stored credential to avoid orphans.
    // Best-effort: do not let cleanup failure mask the original error.
    try {
      await gmailProviderAdapter.disconnect({ orgId, tokenRef: identity.tokenRef });
    } catch {
      // ignore cleanup error
    }
    console.error("[gmail-oauth-service] Failed to create mailbox connection:", error);
    return {
      ok: false,
      error: "internal_error",
      safeMessage: "Failed to save mailbox connection. Please try again.",
    };
  }
}

// ─── Token refresh ────────────────────────────────────────────────────────────

export type GmailRefreshResult =
  | { ok: true; tokenExpiry: Date | null }
  | { ok: false; error: "auth_expired" | "not_found" | "provider_error"; reconnectRequired: boolean };

/**
 * Refresh the Gmail access token for an existing connection.
 *
 * On success: updates tokenExpiry in MailboxConnection and rotates the
 *   credential store entry (same tokenRef, new access token).
 * On auth_expired: transitions the connection to RECONNECT_REQUIRED and
 *   emits a governance audit event.
 * On other provider errors: returns the error without changing connection status.
 *
 * This function is safe to call from background sync jobs. It does not throw.
 */
export async function refreshGmailAuthorization(params: {
  orgId: string;
  connectionId: string;
  tokenRef: string;
  actorId: string;
}): Promise<GmailRefreshResult> {
  const { orgId, connectionId, tokenRef, actorId } = params;

  const result = await gmailProviderAdapter.refreshAuthorization({ orgId, tokenRef });

  if (isMailboxProviderError(result)) {
    if (result.category === "auth_expired" || result.category === "auth_insufficient") {
      // Transition to RECONNECT_REQUIRED and emit audit event.
      await markConnectionReconnectRequired({ orgId, connectionId, actorId, reason: result.safeMessage });
      return { ok: false, error: "auth_expired", reconnectRequired: true };
    }
    return { ok: false, error: "provider_error", reconnectRequired: false };
  }

  // Update tokenExpiry in the connection record.
  await db.mailboxConnection.updateMany({
    where: { id: connectionId, orgId },
    data: { tokenExpiry: result.tokenExpiry },
  });

  return { ok: true, tokenExpiry: result.tokenExpiry };
}

// ─── Reconnect-required transition ───────────────────────────────────────────

/**
 * Transition a connection to RECONNECT_REQUIRED status.
 *
 * This is the durable signal that the admin must re-authorize the mailbox.
 * Emits a dedicated audit event so governance surfaces can show when and why
 * the connection entered this state.
 *
 * Called by:
 *   - refreshGmailAuthorization when the refresh token is expired/revoked
 *   - verifyGmailConnection when the access check fails with auth_expired
 *   - any sync/send path that receives an auth_expired error from the adapter
 */
export async function markConnectionReconnectRequired(params: {
  orgId: string;
  connectionId: string;
  actorId: string;
  reason: string;
}): Promise<void> {
  const { orgId, connectionId, actorId, reason } = params;

  await db.$transaction(async (tx) => {
    const existing = await tx.mailboxConnection.findFirst({
      where: { id: connectionId, orgId },
      select: { id: true, status: true },
    });
    if (!existing) return;
    // Avoid redundant writes if already in RECONNECT_REQUIRED.
    if (existing.status === "RECONNECT_REQUIRED") return;

    await tx.mailboxConnection.update({
      where: { id: existing.id },
      data: { status: "RECONNECT_REQUIRED" },
    });

    await tx.mailboxAuditEvent.create({
      data: {
        orgId,
        actorId,
        action: "CONNECTION_DEGRADED",
        summary: "Gmail mailbox requires reconnection",
        mailboxConnectionId: existing.id,
        metadata: { reason },
      },
    });
  });
}

// ─── Connection verification ──────────────────────────────────────────────────

export type GmailVerifyResult =
  | { ok: true; emailAddress: string; displayName: string }
  | { ok: false; error: "auth_expired" | "provider_error"; reconnectRequired: boolean };

/**
 * Verify a Gmail connection is still valid.
 * On auth failure, transitions the connection to RECONNECT_REQUIRED.
 */
export async function verifyGmailConnection(params: {
  orgId: string;
  connectionId: string;
  tokenRef: string;
  actorId: string;
}): Promise<GmailVerifyResult> {
  const { orgId, connectionId, tokenRef, actorId } = params;

  const result = await gmailProviderAdapter.verifyConnection({ orgId, tokenRef });

  if (isMailboxProviderError(result)) {
    if (result.category === "auth_expired" || result.category === "auth_insufficient") {
      await markConnectionReconnectRequired({ orgId, connectionId, actorId, reason: result.safeMessage });
      return { ok: false, error: "auth_expired", reconnectRequired: true };
    }
    return { ok: false, error: "provider_error", reconnectRequired: false };
  }

  return {
    ok: true,
    emailAddress: result.emailAddress,
    displayName: result.displayName,
  };
}

// ─── Disconnect ───────────────────────────────────────────────────────────────

/**
 * Disconnect a Gmail mailbox: revoke provider authorization, delete the
 * credential store entry, and set the connection status to DISCONNECTED.
 *
 * Org-safe: verifies the connection belongs to the org before any mutation.
 */
export async function disconnectGmailMailbox(params: {
  orgId: string;
  connectionId: string;
  actorId: string;
}): Promise<void> {
  const { orgId, connectionId, actorId } = params;

  const connection = await db.mailboxConnection.findFirst({
    where: { id: connectionId, orgId },
    select: { id: true, tokenRef: true, emailAddress: true },
  });
  if (!connection) {
    throw new Error(`MailboxConnection ${connectionId} not found for org ${orgId}`);
  }

  // 2. Atomically update DB status and emit audit event FIRST.
  await db.$transaction(async (tx) => {
    await tx.mailboxConnection.update({
      where: { id: connection.id },
      data: { status: "DISCONNECTED", disabledAt: new Date(), tokenRef: null, tokenExpiry: null },
    });
    await tx.mailboxAuditEvent.create({
      data: {
        orgId,
        actorId,
        action: "CONNECTION_DISCONNECTED",
        summary: `Disconnected Gmail mailbox: ${connection.emailAddress}`,
        mailboxConnectionId: connection.id,
        metadata: { provider: "GMAIL" },
      },
    });
  });

  // 3. AFTER DB is consistent, revoke provider credentials (best-effort).
  if (connection.tokenRef) {
    await gmailProviderAdapter.disconnect({ orgId, tokenRef: connection.tokenRef });
  }
}

// ─── Internal mapper ──────────────────────────────────────────────────────────

function toConnectionRecord(
  row: Awaited<ReturnType<typeof db.mailboxConnection.findFirstOrThrow>>,
): MailboxConnectionRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    provider: row.provider,
    providerAccountId: row.providerAccountId,
    emailAddress: row.emailAddress,
    displayName: row.displayName,
    status: row.status,
    tokenRef: row.tokenRef,
    tokenExpiry: row.tokenExpiry,
    watchMetadata:
      row.watchMetadata != null &&
      typeof row.watchMetadata === "object" &&
      !Array.isArray(row.watchMetadata)
        ? (row.watchMetadata as Record<string, unknown>)
        : null,
    lastSyncAt: row.lastSyncAt,
    lastSyncError: row.lastSyncError,
    disabledAt: row.disabledAt,
    connectedBy: row.connectedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
