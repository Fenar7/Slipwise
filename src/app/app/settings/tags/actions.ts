"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { renameTag, archiveTag, unarchiveTag } from "@/lib/tags/tag-service";

export interface TagManagementRow {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  description: string | null;
  isArchived: boolean;
  invoiceUsageCount: number;
  voucherUsageCount: number;
  totalUsageCount: number;
  customerDefaultCount: number;
  vendorDefaultCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function listTagsWithUsage(): Promise<TagManagementRow[]> {
  const { orgId } = await requireRole("admin");

  const tags = await db.documentTag.findMany({
    where: { orgId },
    include: {
      _count: {
        select: {
          invoiceAssignments: true,
          voucherAssignments: true,
          customerDefaults: true,
          vendorDefaults: true,
        },
      },
    },
    orderBy: [{ isArchived: "asc" }, { name: "asc" }],
  });

  return tags.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    color: t.color,
    description: t.description,
    isArchived: t.isArchived,
    invoiceUsageCount: t._count.invoiceAssignments,
    voucherUsageCount: t._count.voucherAssignments,
    totalUsageCount: t._count.invoiceAssignments + t._count.voucherAssignments,
    customerDefaultCount: t._count.customerDefaults,
    vendorDefaultCount: t._count.vendorDefaults,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));
}

export { renameTag, archiveTag, unarchiveTag };
