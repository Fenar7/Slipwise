import "server-only";

/**
 * Mailbox credential store.
 *
 * Provides the secure backing mechanism for the `tokenRef` abstraction used in
 * MailboxConnection. Raw OAuth tokens (access_token, refresh_token) are NEVER
 * written to MailboxConnection rows. Instead:
 *
 *   1. Caller stores credentials via `storeMailboxCredential` → receives an
 *      opaque `tokenRef` string.
 *   2. `tokenRef` is stored in MailboxConnection.tokenRef.
 *   3. Provider adapters call `readMailboxCredential(tokenRef)` to retrieve the
 *      decrypted credential payload for API calls.
 *   4. On token refresh, `rotateMailboxCredential` atomically replaces the
 *      stored payload and returns the same (or a new) `tokenRef`.
 *   5. On disconnect, `revokeMailboxCredential` deletes the stored entry.
 *
 * Storage strategy:
 *   Credentials are encrypted with AES-256-GCM (via the repo's existing
 *   `encryptGatewaySecret` / `decryptGatewaySecret`) and stored in the
 *   `MailboxCredential` table. The `tokenRef` is the credential row's `id`
 *   (a CUID), which is opaque to callers.
 *
 * Security invariants:
 *   - Plaintext tokens never leave this module.
 *   - The credential payload is serialised to JSON then encrypted before write.
 *   - Reads decrypt in-process; the decrypted value is never logged.
 *   - All operations are org-scoped: a credential can only be read/rotated/
 *     revoked by the org that owns it.
 *   - `revokeMailboxCredential` is best-effort: it logs but does not throw on
 *     DB failure so that disconnect flows are not blocked by a stale credential.
 */

import { db } from "@/lib/db";
import {
  encryptGatewaySecret,
  decryptGatewaySecret,
} from "@/lib/crypto/gateway-secrets";

// ─── Credential payload ───────────────────────────────────────────────────────

/**
 * The decrypted credential payload stored for a Gmail mailbox connection.
 * All fields are provider-specific and must not appear in any UI-facing shape.
 */
export interface MailboxCredentialPayload {
  /** OAuth access token. Short-lived. */
  accessToken: string;
  /** OAuth refresh token. Long-lived. Null if the provider did not return one. */
  refreshToken: string | null;
  /** Access token expiry as a Unix timestamp (ms). Null if unknown. */
  expiresAtMs: number | null;
  /** Token type, typically "Bearer". */
  tokenType: string;
  /** Space-separated scopes granted by the user. */
  scope: string;
}

// ─── Store ────────────────────────────────────────────────────────────────────

/**
 * Encrypt and persist a credential payload.
 * Returns the opaque `tokenRef` to store in MailboxConnection.tokenRef.
 *
 * Org-scoped: the credential row carries `orgId` so that read/rotate/revoke
 * operations can enforce ownership.
 */
export async function storeMailboxCredential(
  orgId: string,
  payload: MailboxCredentialPayload,
  connectionId: string | null = null,
): Promise<string> {
  const encrypted = encryptGatewaySecret(JSON.stringify(payload));
  const row = await db.mailboxCredential.create({
    data: { orgId, connectionId, encryptedPayload: encrypted },
    select: { id: true },
  });
  return row.id;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Retrieve and decrypt a credential payload by tokenRef.
 *
 * Returns null if the credential does not exist or belongs to a different org.
 * Callers must treat null as a reconnect-required signal.
 */
export async function readMailboxCredential(
  orgId: string,
  tokenRef: string,
): Promise<MailboxCredentialPayload | null> {
  const row = await db.mailboxCredential.findFirst({
    where: { id: tokenRef, orgId },
    select: { encryptedPayload: true },
  });
  if (!row) return null;

  try {
    const json = decryptGatewaySecret(row.encryptedPayload);
    return JSON.parse(json) as MailboxCredentialPayload;
  } catch {
    // Decryption failure: treat as missing credential (key rotation or corruption).
    // Do NOT log the encrypted payload.
    console.error(
      "[mailbox-credential] Decryption failed for tokenRef — treating as missing",
    );
    return null;
  }
}

// ─── Rotate ───────────────────────────────────────────────────────────────────

/**
 * Replace the stored credential payload in-place (same tokenRef).
 * Used after a successful token refresh: the tokenRef in MailboxConnection
 * does not change, only the encrypted payload is updated.
 *
 * Throws if the credential does not exist or belongs to a different org.
 */
export async function rotateMailboxCredential(
  orgId: string,
  tokenRef: string,
  newPayload: MailboxCredentialPayload,
): Promise<void> {
  const existing = await db.mailboxCredential.findFirst({
    where: { id: tokenRef, orgId },
    select: { id: true },
  });
  if (!existing) {
    throw new Error(
      `MailboxCredential ${tokenRef} not found for org ${orgId}`,
    );
  }

  const encrypted = encryptGatewaySecret(JSON.stringify(newPayload));
  await db.mailboxCredential.update({
    where: { id: existing.id },
    data: { encryptedPayload: encrypted },
  });
}

// ─── Revoke ───────────────────────────────────────────────────────────────────

/**
 * Delete the stored credential entry.
 * Best-effort: logs on failure but does not throw so that disconnect flows
 * are not blocked by a stale or already-deleted credential row.
 *
 * Org-scoped: only deletes if the row belongs to the given org.
 */
export async function revokeMailboxCredential(
  orgId: string,
  tokenRef: string,
): Promise<void> {
  try {
    await db.mailboxCredential.deleteMany({
      where: { id: tokenRef, orgId },
    });
  } catch (error) {
    console.error(
      "[mailbox-credential] Failed to revoke credential — continuing disconnect:",
      error,
    );
  }
}
