import "server-only";

import { createHash } from "node:crypto";
import { db } from "@/lib/db";

const LOCK_TIMEOUT_MS = 30_000;

function lockKey(connectionId: string): number {
  const hash = createHash("md5").update(connectionId).digest("hex");
  return parseInt(hash.slice(0, 8), 16);
}

/**
 * Try to acquire a session-level PostgreSQL advisory lock for a mailbox connection.
 * Returns true if the lock was acquired, false if another session holds it.
 *
 * IMPORTANT: Each acquire must be paired with a corresponding `releaseMailboxLock` call,
 * preferably in a `finally` block. Session-level locks survive beyond individual
 * transactions and are only released when explicitly unlocked or the session ends.
 */
export async function tryAcquireMailboxLock(
  orgId: string,
  connectionId: string,
): Promise<boolean> {
  const key = lockKey(connectionId);
  const result = await db.$queryRawUnsafe<Array<{ locked: boolean }>>(
    `SELECT pg_try_advisory_lock($1) AS locked`,
    key,
  );
  return result?.[0]?.locked === true;
}

/**
 * Release a session-level PostgreSQL advisory lock for a mailbox connection.
 * Must be called after a successful `tryAcquireMailboxLock` once the critical
 * section completes.
 */
export async function releaseMailboxLock(
  orgId: string,
  connectionId: string,
): Promise<void> {
  const key = lockKey(connectionId);
  await db.$queryRawUnsafe(
    `SELECT pg_advisory_unlock($1)`,
    key,
  );
}

/**
 * Execute a function within a mailbox-scoped advisory lock.
 * The lock is automatically released when the function completes or throws.
 */
export async function withMailboxLock<T>(
  orgId: string,
  connectionId: string,
  fn: () => Promise<T>,
  timeoutMs: number = LOCK_TIMEOUT_MS,
): Promise<T> {
  const acquired = await tryAcquireMailboxLock(orgId, connectionId);
  if (!acquired) {
    throw Object.assign(
      new Error("Mailbox is locked by another operation"),
      { code: "MAILBOX_LOCKED", connectionId },
    );
  }

  const timer = setTimeout(() => {
    releaseMailboxLock(orgId, connectionId).catch(() => {});
    throw Object.assign(
      new Error("Mailbox lock timed out"),
      { code: "MAILBOX_LOCK_TIMEOUT", connectionId },
    );
  }, timeoutMs);

  try {
    return await fn();
  } finally {
    clearTimeout(timer);
    await releaseMailboxLock(orgId, connectionId);
  }
}
