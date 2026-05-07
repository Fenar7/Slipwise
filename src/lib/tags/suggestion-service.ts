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
          where: {
            customerId: counterpartyId,
            tag: { orgId, isArchived: false },
          },
          include: { tag: { select: { id: true, name: true, slug: true, color: true } } },
        })
      : await db.vendorDefaultTag.findMany({
          where: {
            vendorId: counterpartyId,
            tag: { orgId, isArchived: false },
          },
          include: { tag: { select: { id: true, name: true, slug: true, color: true } } },
        });

  for (const a of defaultAssignments) {
    if (!seen.has(a.tag.id)) {
      seen.add(a.tag.id);
      results.push({
        id: a.tag.id,
        name: a.tag.name,
        slug: a.tag.slug,
        color: a.tag.color,
        source: "default",
        usageCount: -1,
      });
    }
  }

  // 2. Recent tags used with this counterparty
  if (documentType === "invoice" && counterpartyType === "customer") {
    const recentInvoiceTags = await db.invoiceTagAssignment.findMany({
      where: {
        invoice: {
          organizationId: orgId,
          archivedAt: null,
          customerId: counterpartyId,
        },
        tag: { orgId, isArchived: false },
      },
      include: { tag: { select: { id: true, name: true, slug: true, color: true } } },
      orderBy: { invoice: { createdAt: "desc" } },
      take: 100,
    });

    const tagCounts = new Map<string, number>();
    for (const a of recentInvoiceTags) {
      tagCounts.set(a.tag.id, (tagCounts.get(a.tag.id) ?? 0) + 1);
    }
    for (const [tagId, count] of [...tagCounts.entries()].sort(
      (a, b) => b[1] - a[1]
    )) {
      if (!seen.has(tagId) && results.length < limit) {
        // Find the tag data
        for (const a of recentInvoiceTags) {
          if (a.tag.id === tagId && !seen.has(tagId)) {
            seen.add(tagId);
            results.push({
              id: a.tag.id,
              name: a.tag.name,
              slug: a.tag.slug,
              color: a.tag.color,
              source: "recent",
              usageCount: count,
            });
            break;
          }
        }
      }
    }
  }

  if (documentType === "voucher" && counterpartyType === "vendor") {
    const recentVoucherTags = await db.voucherTagAssignment.findMany({
      where: {
        voucher: {
          organizationId: orgId,
          archivedAt: null,
          vendorId: counterpartyId,
        },
        tag: { orgId, isArchived: false },
      },
      include: { tag: { select: { id: true, name: true, slug: true, color: true } } },
      orderBy: { voucher: { createdAt: "desc" } },
      take: 100,
    });

    const tagCounts = new Map<string, number>();
    for (const a of recentVoucherTags) {
      tagCounts.set(a.tag.id, (tagCounts.get(a.tag.id) ?? 0) + 1);
    }
    for (const [tagId, count] of [...tagCounts.entries()].sort(
      (a, b) => b[1] - a[1]
    )) {
      if (!seen.has(tagId)) {
        for (const a of recentVoucherTags) {
          if (a.tag.id === tagId && !seen.has(tagId)) {
            seen.add(tagId);
            results.push({
              id: a.tag.id,
              name: a.tag.name,
              slug: a.tag.slug,
              color: a.tag.color,
              source: "recent",
              usageCount: count,
            });
            break;
          }
        }
      }
    }
  }

  // 3. Org-wide popular tags as fallback
  if (results.length < limit) {
    const tableForType =
      documentType === "invoice"
        ? (db.invoiceTagAssignment as any)
        : (db.voucherTagAssignment as any);

    const popularAssignments = await tableForType.findMany({
      where: {
        ...(documentType === "invoice"
          ? { invoice: { organizationId: orgId, archivedAt: null } }
          : { voucher: { organizationId: orgId, archivedAt: null } }),
        tag: { orgId, isArchived: false },
      },
      include: { tag: { select: { id: true, name: true, slug: true, color: true } } },
      take: 200,
    });

    const tagCounts = new Map<string, number>();
    for (const a of popularAssignments) {
      tagCounts.set(a.tagId, (tagCounts.get(a.tagId) ?? 0) + 1);
    }
    for (const [tagId, count] of [...tagCounts.entries()].sort(
      (a, b) => b[1] - a[1]
    )) {
      if (!seen.has(tagId) && results.length < limit) {
        for (const a of popularAssignments) {
          if (a.tagId === tagId && !seen.has(tagId)) {
            seen.add(tagId);
            results.push({
              id: a.tag.id,
              name: a.tag.name,
              slug: a.tag.slug,
              color: a.tag.color,
              source: "popular",
              usageCount: count,
            });
            break;
          }
        }
      }
    }
  }

  return results;
}
