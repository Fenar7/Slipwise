import "server-only";

import { db } from "@/lib/db";
import type { ActiveFilter } from "@/app/app/mailbox/types";

export interface MailboxSavedViewRecord {
  id: string;
  orgId: string;
  createdBy: string;
  label: string;
  filters: ActiveFilter[];
  searchQuery: string;
  smartViewId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toRecord(row: {
  id: string;
  orgId: string;
  createdBy: string;
  label: string;
  filters: unknown;
  searchQuery: string;
  smartViewId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): MailboxSavedViewRecord {
  return {
    ...row,
    filters: Array.isArray(row.filters) ? (row.filters as ActiveFilter[]) : [],
  };
}

export async function listMailboxSavedViews(
  orgId: string,
  createdBy: string,
): Promise<MailboxSavedViewRecord[]> {
  const rows = await db.mailboxSavedView.findMany({
    where: { orgId, createdBy },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toRecord);
}

export interface CreateMailboxSavedViewParams {
  orgId: string;
  createdBy: string;
  label: string;
  filters: ActiveFilter[];
  searchQuery?: string;
  smartViewId?: string | null;
}

export async function createMailboxSavedView(
  params: CreateMailboxSavedViewParams,
): Promise<MailboxSavedViewRecord> {
  const row = await db.mailboxSavedView.create({
    data: {
      orgId: params.orgId,
      createdBy: params.createdBy,
      label: params.label,
      filters: params.filters as unknown as Record<string, unknown>[],
      searchQuery: params.searchQuery ?? "",
      smartViewId: params.smartViewId ?? null,
    },
  });
  return toRecord(row);
}

export async function deleteMailboxSavedView(
  id: string,
  orgId: string,
  createdBy: string,
): Promise<boolean> {
  try {
    await db.mailboxSavedView.delete({
      where: { id, orgId, createdBy },
    });
    return true;
  } catch {
    return false;
  }
}
