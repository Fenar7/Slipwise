import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const LOCK_TIMEOUT_MS = 30_000;

function lockKey(connectionId: string): number {
  const hash = createHash("md5").update(connectionId).digest("hex");
  return parseInt(hash.slice(0, 8), 16);
}

/**
 * Execute a function within a mailbox-scoped PostgreSQL advisory lock.
 *
 * Uses `pg_try_advisory_xact_lock` inside a Prisma transaction so the lock is
 * automatically released when the transaction commits or rolls back —
 * eliminating connection-pooling lock leaks that session-level locks incur.
 *
 * The lock is transaction-scoped: it is held for the entire duration of `fn()`
 * and released when `fn()` completes, throws, or the timeout fires. Because the
 * underlying `$transaction` callback keeps the Prisma transaction open, the
 * advisory lock remains live even though `fn()` uses the global `db` client for
 * its database work (those queries use separate pooled connections).
 *
 * If the timeout fires before `fn()` settles, the transaction rolls back,
 * the advisory lock is released, and the race-loser settles with a rejected
 * Promise. The running `fn()` is NOT aborted — it continues but any subsequent
 * database writes it attempts will use connections independent of the rolled-back
 * transaction. Callers should treat this as "best-effort cancellation" and must
 * not rely on post-timeout side effects being applied.
 *
 * @returns The value returned by `fn()`.
 * @throws {Error} with `code: "MAILBOX_LOCKED"` if another session holds the lock.
 * @throws {Error} with `code: "MAILBOX_LOCK_TIMEOUT"` if `fn()` exceeds `timeoutMs`.
 */
export async function withMailboxLock<T>(
  orgId: string,
  connectionId: string,
  fn: () => Promise<T>,
  timeoutMs: number = LOCK_TIMEOUT_MS,
): Promise<T> {
  const key = lockKey(connectionId);

  return db.$transaction(async (tx) => {
    const result = await tx.$queryRawUnsafe<Array<{ locked: boolean }>>(
      `SELECT pg_try_advisory_xact_lock($1) AS locked`,
      key,
    );

    if (!result?.[0]?.locked) {
      throw Object.assign(
        new Error("Mailbox is locked by another operation"),
        { code: "MAILBOX_LOCKED" },
      );
    }

    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          Object.assign(
            new Error("Mailbox lock timed out"),
            { code: "MAILBOX_LOCK_TIMEOUT" },
          ),
        );
      }, timeoutMs);
    });

    try {
      return await Promise.race([fn(), timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  });
}
