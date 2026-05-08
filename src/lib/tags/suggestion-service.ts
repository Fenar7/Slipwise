"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";

export type SuggestionContext = {
  counterpartyId: string;
  counterpartyType: "customer" | "vendor";
  documentType: "invoice" | "voucher";
  limit?: number;
};

export interface SuggestedTag {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  source: "default" | "recent" | "popular";
  usageCount: number;
}

/**
 * Returns suggested tags for a document workflow.
 *
 * Precedence:
 * 1. Counterparty default tags (direct pre-fill handled by picker)
 * 2. Recent tags used with this specific counterparty
 * 3. Org-wide popular tags (fallback)
 *
 * Archived tags are excluded from all categories.
 * Results are deduplicated by tag ID.
 */
export async function getSuggestedTags(
  context: SuggestionContext
): Promise<SuggestedTag[]> {
  const { orgId } = await requireOrgContext();
  const { counterpartyId, counterpartyType, documentType, limit = 5 } = context;

  const seen = new Set<string>();
  const results: SuggestedTag[] = [];

  // 1. Counterparty default tags
  const defaultAssignments =
    counterpartyType === "customer"
      ? await db.customerDefaultTag.findMany({
          where: { customerId: counterpartyId, tag: { orgId, isArchived: false } },
          include: { tag: { select: { id: true, name: true, slug: true, color: true } } },
        })
      : await db.vendorDefaultTag.findMany({
          where: { vendorId: counterpartyId, tag: { orgId, isArchived: false } },
          include: { tag: { select: { id: true, name: true, slug: true, color: true } } },
        });

  for (const a of defaultAssignments) {
    if (!seen.has(a.tag.id)) {
      seen.add(a.tag.id);
      results.push({ id: a.tag.id, name: a.tag.name, slug: a.tag.slug, color: a.tag.color, source: "default", usageCount: -1 });
    }
  }

  // 2. Recent tags used with this counterparty
  if (results.length < limit) {
    if (documentType === "invoice" && counterpartyType === "customer") {
      const recent = await db.invoiceTagAssignment.findMany({
        where: { invoice: { organizationId: orgId, archivedAt: null, customerId: counterpartyId }, tag: { orgId, isArchived: false } },
        include: { tag: { select: { id: true, name: true, slug: true, color: true } } },
        orderBy: { invoice: { createdAt: "desc" } },
        take: 100,
      });
      const counts = new Map<string, number>();
      for (const a of recent) counts.set(a.tag.id, (counts.get(a.tag.id) ?? 0) + 1);
      for (const [tagId, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
        if (!seen.has(tagId) && results.length < limit) {
          const a = recent.find((r) => r.tag.id === tagId)!;
          seen.add(tagId);
          results.push({ id: a.tag.id, name: a.tag.name, slug: a.tag.slug, color: a.tag.color, source: "recent", usageCount: count });
        }
      }
    }
    if (documentType === "voucher" && counterpartyType === "vendor") {
      const recent = await db.voucherTagAssignment.findMany({
        where: { voucher: { organizationId: orgId, archivedAt: null, vendorId: counterpartyId }, tag: { orgId, isArchived: false } },
        include: { tag: { select: { id: true, name: true, slug: true, color: true } } },
        orderBy: { voucher: { createdAt: "desc" } },
        take: 100,
      });
      const counts = new Map<string, number>();
      for (const a of recent) counts.set(a.tag.id, (counts.get(a.tag.id) ?? 0) + 1);
      for (const [tagId, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
        if (!seen.has(tagId) && results.length < limit) {
          const a = recent.find((r) => r.tag.id === tagId)!;
          seen.add(tagId);
          results.push({ id: a.tag.id, name: a.tag.name, slug: a.tag.slug, color: a.tag.color, source: "recent", usageCount: count });
        }
      }
    }
  }

  // 3. Org-wide popular tags as fallback
  if (results.length < limit) {
    const popular = documentType === "invoice"
      ? await db.invoiceTagAssignment.findMany({
          where: { invoice: { organizationId: orgId, archivedAt: null }, tag: { orgId, isArchived: false } },
          include: { tag: { select: { id: true, name: true, slug: true, color: true } } },
          take: 200,
        })
      : await db.voucherTagAssignment.findMany({
          where: { voucher: { organizationId: orgId, archivedAt: null }, tag: { orgId, isArchived: false } },
          include: { tag: { select: { id: true, name: true, slug: true, color: true } } },
          take: 200,
        });
    const counts = new Map<string, number>();
    for (const a of popular) counts.set(a.tag.id, (counts.get(a.tag.id) ?? 0) + 1);
    for (const [tagId, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      if (!seen.has(tagId) && results.length < limit) {
        const a = popular.find((r) => r.tag.id === tagId)!;
        seen.add(tagId);
        results.push({ id: a.tag.id, name: a.tag.name, slug: a.tag.slug, color: a.tag.color, source: "popular", usageCount: count });
      }
    }
  }

  return results;
}
