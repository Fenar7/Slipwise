"use server";

import { db } from "@/lib/db";
import { requireOrgContext, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

async function tagAudit(
  orgId: string,
  actorId: string,
  action: string,
  tagId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  logAudit({
    orgId,
    actorId,
    action,
    entityType: "Tag",
    entityId: tagId,
    metadata,
  }).catch(() => {});
}

export interface TagData {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  color: string | null;
  description: string | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function checkDuplicateName(
  orgId: string,
  slug: string,
  excludeId?: string
): Promise<boolean> {
  const where: Record<string, unknown> = { orgId, slug };
  if (excludeId) where.id = { not: excludeId };
  const existing = await db.documentTag.findFirst({ where, select: { id: true } });
  return existing !== null;
}

export async function createTag(input: {
  name: string;
  color?: string;
  description?: string;
}): Promise<ActionResult<TagData>> {
  try {
    const { orgId, userId } = await requireRole("admin");

    const name = input.name.trim();
    if (!name) return { success: false, error: "Tag name is required" };

    const slug = toSlug(name);
    if (!slug) return { success: false, error: "Tag name must contain at least one letter or number" };

    const exists = await checkDuplicateName(orgId, slug);
    if (exists) return { success: false, error: "A tag with a similar name already exists in your organization" };

    const tag = await db.documentTag.create({
      data: {
        orgId,
        name,
        slug,
        color: input.color?.trim() || null,
        description: input.description?.trim() || null,
      },
    });

    void tagAudit(orgId, userId, "tag.created", tag.id, { name, slug });

    return { success: true, data: tag };
  } catch (error) {
    console.error("createTag error:", error);
    return { success: false, error: "Failed to create tag" };
  }
}

export async function listTags(params?: {
  includeArchived?: boolean;
}): Promise<ActionResult<TagData[]>> {
  try {
    const { orgId } = await requireOrgContext();

    const where: Record<string, unknown> = { orgId };
    if (!params?.includeArchived) where.isArchived = false;

    const tags = await db.documentTag.findMany({
      where,
      orderBy: { name: "asc" },
    });

    return { success: true, data: tags };
  } catch (error) {
    console.error("listTags error:", error);
    return { success: false, error: "Failed to list tags" };
  }
}

export async function getTag(id: string): Promise<ActionResult<TagData>> {
  try {
    const { orgId } = await requireOrgContext();

    const tag = await db.documentTag.findFirst({
      where: { id, orgId },
    });

    if (!tag) return { success: false, error: "Tag not found" };

    return { success: true, data: tag };
  } catch (error) {
    console.error("getTag error:", error);
    return { success: false, error: "Failed to get tag" };
  }
}

export async function renameTag(
  id: string,
  input: { name: string }
): Promise<ActionResult<TagData>> {
  try {
    const { orgId, userId } = await requireRole("admin");

    const name = input.name.trim();
    if (!name) return { success: false, error: "Tag name is required" };

    const slug = toSlug(name);
    if (!slug) return { success: false, error: "Tag name must contain at least one letter or number" };

    const existing = await db.documentTag.findFirst({
      where: { id, orgId },
    });
    if (!existing) return { success: false, error: "Tag not found" };

    if (existing.slug === slug) {
      const tag = await db.documentTag.update({
        where: { id },
        data: { name },
      });
      void tagAudit(orgId, userId, "tag.renamed", id, { oldName: existing.name, newName: name });
      return { success: true, data: tag };
    }

    const duplicate = await checkDuplicateName(orgId, slug, id);
    if (duplicate) return { success: false, error: "A tag with a similar name already exists in your organization" };

    const tag = await db.documentTag.update({
      where: { id },
      data: { name, slug },
    });

    void tagAudit(orgId, userId, "tag.renamed", id, { oldName: existing.name, newName: name });

    return { success: true, data: tag };
  } catch (error) {
    console.error("renameTag error:", error);
    return { success: false, error: "Failed to rename tag" };
  }
}

export async function archiveTag(id: string): Promise<ActionResult<TagData>> {
  try {
    const { orgId, userId } = await requireRole("admin");

    const existing = await db.documentTag.findFirst({
      where: { id, orgId },
    });
    if (!existing) return { success: false, error: "Tag not found" };

    const tag = await db.documentTag.update({
      where: { id },
      data: { isArchived: true },
    });

    void tagAudit(orgId, userId, "tag.archived", id, { name: existing.name });

    return { success: true, data: tag };
  } catch (error) {
    console.error("archiveTag error:", error);
    return { success: false, error: "Failed to archive tag" };
  }
}

export async function unarchiveTag(id: string): Promise<ActionResult<TagData>> {
  try {
    const { orgId, userId } = await requireRole("admin");

    const existing = await db.documentTag.findFirst({
      where: { id, orgId },
    });
    if (!existing) return { success: false, error: "Tag not found" };

    const tag = await db.documentTag.update({
      where: { id },
      data: { isArchived: false },
    });

    void tagAudit(orgId, userId, "tag.unarchived", id, { name: existing.name });

    return { success: true, data: tag };
  } catch (error) {
    console.error("unarchiveTag error:", error);
    return { success: false, error: "Failed to unarchive tag" };
  }
}
