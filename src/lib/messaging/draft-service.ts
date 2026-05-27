import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { ConversationDraftRecord } from "./domain-types";
import { draftOrgSafeWhere } from "./org-safe-helpers";
import { toDraftRecord } from "./mappers";
import type { SaveDraftInput, GetDraftInput, DeleteDraftInput } from "./service-contracts";
import { assertActiveParticipant } from "./service-helpers";

/**
 * Get a draft for a user in a conversation/thread.
 * Returns null if no draft exists.
 */
export async function getDraft(
  input: GetDraftInput,
): Promise<ConversationDraftRecord | null> {
  const row = await db.conversationDraft.findFirst({
    where: draftOrgSafeWhere(
      input.orgId,
      input.conversationId,
      input.userId,
      input.threadId ?? null,
    ),
  });
  return row ? toDraftRecord(row) : null;
}

/**
 * Save (upsert) a draft for a user in a conversation/thread.
 * Only active participants may save drafts.
 */
export async function saveDraft(
  input: SaveDraftInput,
): Promise<ConversationDraftRecord> {
  const result = await db.$transaction(async (tx) => {
    await assertActiveParticipant(
      tx,
      input.orgId,
      input.conversationId,
      input.userId,
      "saveDraft",
    );

    const existing = await tx.conversationDraft.findFirst({
      where: draftOrgSafeWhere(
        input.orgId,
        input.conversationId,
        input.userId,
        input.threadId ?? null,
      ),
    });

    if (existing) {
      const updated = await tx.conversationDraft.update({
        where: { id: existing.id },
        data: {
          body: input.body,
          contentMeta: (input.contentMeta ?? {}) as Prisma.InputJsonValue,
        },
      });
      return toDraftRecord(updated);
    }

    const created = await tx.conversationDraft.create({
      data: {
        orgId: input.orgId,
        conversationId: input.conversationId,
        threadId: input.threadId ?? null,
        userId: input.userId,
        body: input.body,
        contentMeta: input.contentMeta ?? {},
      },
    });
    return toDraftRecord(created);
  });

  return result;
}

/**
 * Delete a draft for a user in a conversation/thread.
 * Safe to call when no draft exists.
 */
export async function deleteDraft(
  input: DeleteDraftInput,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await assertActiveParticipant(
      tx,
      input.orgId,
      input.conversationId,
      input.userId,
      "deleteDraft",
    );

    const existing = await tx.conversationDraft.findFirst({
      where: draftOrgSafeWhere(
        input.orgId,
        input.conversationId,
        input.userId,
        input.threadId ?? null,
      ),
    });

    if (existing) {
      await tx.conversationDraft.delete({
        where: { id: existing.id },
      });
    }
  });
}
