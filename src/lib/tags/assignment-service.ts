"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import type { TagData } from "./tag-service";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

async function verifyOrgEntity(
  orgId: string,
  table: "invoice" | "voucher" | "customer" | "vendor",
  id: string
): Promise<boolean> {
  const record = await (db as any)[table].findFirst({
    where: { id, organizationId: orgId },
    select: { id: true },
  });
  return record !== null;
}

// ─── Invoice Tag Assignments ────────────────────────────────────────────────────

export async function addInvoiceTag(
  invoiceId: string,
  tagId: string
): Promise<ActionResult<null>> {
  try {
    const { orgId } = await requireOrgContext();

    if (!(await verifyOrgEntity(orgId, "invoice", invoiceId))) {
      return { success: false, error: "Invoice not found" };
    }

    const tag = await db.documentTag.findFirst({
      where: { id: tagId, orgId },
      select: { id: true },
    });
    if (!tag) return { success: false, error: "Tag not found" };

    const existing = await db.invoiceTagAssignment.findFirst({
      where: { invoiceId, tagId },
      select: { id: true },
    });

    if (!existing) {
      await db.invoiceTagAssignment.create({ data: { invoiceId, tagId } });
    }

    return { success: true, data: null };
  } catch (error) {
    console.error("addInvoiceTag error:", error);
    return { success: false, error: "Failed to add tag to invoice" };
  }
}

export async function removeInvoiceTag(
  invoiceId: string,
  tagId: string
): Promise<ActionResult<null>> {
  try {
    const { orgId } = await requireOrgContext();

    if (!(await verifyOrgEntity(orgId, "invoice", invoiceId))) {
      return { success: false, error: "Invoice not found" };
    }

    await db.invoiceTagAssignment.deleteMany({
      where: { invoiceId, tagId },
    });

    return { success: true, data: null };
  } catch (error) {
    console.error("removeInvoiceTag error:", error);
    return { success: false, error: "Failed to remove tag from invoice" };
  }
}

export async function setInvoiceTags(
  invoiceId: string,
  tagIds: string[]
): Promise<ActionResult<null>> {
  try {
    const { orgId } = await requireOrgContext();

    if (!(await verifyOrgEntity(orgId, "invoice", invoiceId))) {
      return { success: false, error: "Invoice not found" };
    }

    if (tagIds.length > 0) {
      const tags = await db.documentTag.findMany({
        where: { id: { in: tagIds }, orgId },
        select: { id: true },
      });
      const validIds = new Set(tags.map((t) => t.id));
      const invalidIds = tagIds.filter((id) => !validIds.has(id));
      if (invalidIds.length > 0) {
        return { success: false, error: `Tags not found: ${invalidIds.join(", ")}` };
      }
    }

    await db.$transaction([
      db.invoiceTagAssignment.deleteMany({ where: { invoiceId } }),
      ...tagIds.map((tagId) =>
        db.invoiceTagAssignment.create({ data: { invoiceId, tagId } })
      ),
    ]);

    return { success: true, data: null };
  } catch (error) {
    console.error("setInvoiceTags error:", error);
    return { success: false, error: "Failed to set invoice tags" };
  }
}

export async function getInvoiceTags(
  invoiceId: string
): Promise<ActionResult<TagData[]>> {
  try {
    const { orgId } = await requireOrgContext();

    if (!(await verifyOrgEntity(orgId, "invoice", invoiceId))) {
      return { success: false, error: "Invoice not found" };
    }

    const assignments = await db.invoiceTagAssignment.findMany({
      where: { invoiceId },
      include: { tag: true },
      orderBy: { tag: { name: "asc" } },
    });

    return { success: true, data: assignments.map((a) => a.tag as TagData) };
  } catch (error) {
    console.error("getInvoiceTags error:", error);
    return { success: false, error: "Failed to get invoice tags" };
  }
}

// ─── Voucher Tag Assignments ────────────────────────────────────────────────────

export async function addVoucherTag(
  voucherId: string,
  tagId: string
): Promise<ActionResult<null>> {
  try {
    const { orgId } = await requireOrgContext();

    if (!(await verifyOrgEntity(orgId, "voucher", voucherId))) {
      return { success: false, error: "Voucher not found" };
    }

    const tag = await db.documentTag.findFirst({
      where: { id: tagId, orgId },
      select: { id: true },
    });
    if (!tag) return { success: false, error: "Tag not found" };

    const existing = await db.voucherTagAssignment.findFirst({
      where: { voucherId, tagId },
      select: { id: true },
    });

    if (!existing) {
      await db.voucherTagAssignment.create({ data: { voucherId, tagId } });
    }

    return { success: true, data: null };
  } catch (error) {
    console.error("addVoucherTag error:", error);
    return { success: false, error: "Failed to add tag to voucher" };
  }
}

export async function removeVoucherTag(
  voucherId: string,
  tagId: string
): Promise<ActionResult<null>> {
  try {
    const { orgId } = await requireOrgContext();

    if (!(await verifyOrgEntity(orgId, "voucher", voucherId))) {
      return { success: false, error: "Voucher not found" };
    }

    await db.voucherTagAssignment.deleteMany({
      where: { voucherId, tagId },
    });

    return { success: true, data: null };
  } catch (error) {
    console.error("removeVoucherTag error:", error);
    return { success: false, error: "Failed to remove tag from voucher" };
  }
}

export async function setVoucherTags(
  voucherId: string,
  tagIds: string[]
): Promise<ActionResult<null>> {
  try {
    const { orgId } = await requireOrgContext();

    if (!(await verifyOrgEntity(orgId, "voucher", voucherId))) {
      return { success: false, error: "Voucher not found" };
    }

    if (tagIds.length > 0) {
      const tags = await db.documentTag.findMany({
        where: { id: { in: tagIds }, orgId },
        select: { id: true },
      });
      const validIds = new Set(tags.map((t) => t.id));
      const invalidIds = tagIds.filter((id) => !validIds.has(id));
      if (invalidIds.length > 0) {
        return { success: false, error: `Tags not found: ${invalidIds.join(", ")}` };
      }
    }

    await db.$transaction([
      db.voucherTagAssignment.deleteMany({ where: { voucherId } }),
      ...tagIds.map((tagId) =>
        db.voucherTagAssignment.create({ data: { voucherId, tagId } })
      ),
    ]);

    return { success: true, data: null };
  } catch (error) {
    console.error("setVoucherTags error:", error);
    return { success: false, error: "Failed to set voucher tags" };
  }
}

export async function getVoucherTags(
  voucherId: string
): Promise<ActionResult<TagData[]>> {
  try {
    const { orgId } = await requireOrgContext();

    if (!(await verifyOrgEntity(orgId, "voucher", voucherId))) {
      return { success: false, error: "Voucher not found" };
    }

    const assignments = await db.voucherTagAssignment.findMany({
      where: { voucherId },
      include: { tag: true },
      orderBy: { tag: { name: "asc" } },
    });

    return { success: true, data: assignments.map((a) => a.tag as TagData) };
  } catch (error) {
    console.error("getVoucherTags error:", error);
    return { success: false, error: "Failed to get voucher tags" };
  }
}

// ─── Customer Default Tags ──────────────────────────────────────────────────────

export async function addCustomerDefaultTag(
  customerId: string,
  tagId: string
): Promise<ActionResult<null>> {
  try {
    const { orgId } = await requireOrgContext();

    if (!(await verifyOrgEntity(orgId, "customer", customerId))) {
      return { success: false, error: "Customer not found" };
    }

    const tag = await db.documentTag.findFirst({
      where: { id: tagId, orgId },
      select: { id: true },
    });
    if (!tag) return { success: false, error: "Tag not found" };

    const existing = await db.customerDefaultTag.findFirst({
      where: { customerId, tagId },
      select: { id: true },
    });

    if (!existing) {
      await db.customerDefaultTag.create({ data: { customerId, tagId } });
    }

    return { success: true, data: null };
  } catch (error) {
    console.error("addCustomerDefaultTag error:", error);
    return { success: false, error: "Failed to add default tag to customer" };
  }
}

export async function removeCustomerDefaultTag(
  customerId: string,
  tagId: string
): Promise<ActionResult<null>> {
  try {
    const { orgId } = await requireOrgContext();

    if (!(await verifyOrgEntity(orgId, "customer", customerId))) {
      return { success: false, error: "Customer not found" };
    }

    await db.customerDefaultTag.deleteMany({
      where: { customerId, tagId },
    });

    return { success: true, data: null };
  } catch (error) {
    console.error("removeCustomerDefaultTag error:", error);
    return { success: false, error: "Failed to remove default tag from customer" };
  }
}

export async function setCustomerDefaultTags(
  customerId: string,
  tagIds: string[]
): Promise<ActionResult<null>> {
  try {
    const { orgId } = await requireOrgContext();

    if (!(await verifyOrgEntity(orgId, "customer", customerId))) {
      return { success: false, error: "Customer not found" };
    }

    if (tagIds.length > 0) {
      const tags = await db.documentTag.findMany({
        where: { id: { in: tagIds }, orgId },
        select: { id: true },
      });
      const validIds = new Set(tags.map((t) => t.id));
      const invalidIds = tagIds.filter((id) => !validIds.has(id));
      if (invalidIds.length > 0) {
        return { success: false, error: `Tags not found: ${invalidIds.join(", ")}` };
      }
    }

    await db.$transaction([
      db.customerDefaultTag.deleteMany({ where: { customerId } }),
      ...tagIds.map((tagId) =>
        db.customerDefaultTag.create({ data: { customerId, tagId } })
      ),
    ]);

    return { success: true, data: null };
  } catch (error) {
    console.error("setCustomerDefaultTags error:", error);
    return { success: false, error: "Failed to set customer default tags" };
  }
}

export async function getCustomerDefaultTags(
  customerId: string
): Promise<ActionResult<TagData[]>> {
  try {
    const { orgId } = await requireOrgContext();

    if (!(await verifyOrgEntity(orgId, "customer", customerId))) {
      return { success: false, error: "Customer not found" };
    }

    const defaults = await db.customerDefaultTag.findMany({
      where: { customerId },
      include: { tag: true },
      orderBy: { tag: { name: "asc" } },
    });

    return { success: true, data: defaults.map((d) => d.tag as TagData) };
  } catch (error) {
    console.error("getCustomerDefaultTags error:", error);
    return { success: false, error: "Failed to get customer default tags" };
  }
}

// ─── Vendor Default Tags ────────────────────────────────────────────────────────

export async function addVendorDefaultTag(
  vendorId: string,
  tagId: string
): Promise<ActionResult<null>> {
  try {
    const { orgId } = await requireOrgContext();

    if (!(await verifyOrgEntity(orgId, "vendor", vendorId))) {
      return { success: false, error: "Vendor not found" };
    }

    const tag = await db.documentTag.findFirst({
      where: { id: tagId, orgId },
      select: { id: true },
    });
    if (!tag) return { success: false, error: "Tag not found" };

    const existing = await db.vendorDefaultTag.findFirst({
      where: { vendorId, tagId },
      select: { id: true },
    });

    if (!existing) {
      await db.vendorDefaultTag.create({ data: { vendorId, tagId } });
    }

    return { success: true, data: null };
  } catch (error) {
    console.error("addVendorDefaultTag error:", error);
    return { success: false, error: "Failed to add default tag to vendor" };
  }
}

export async function removeVendorDefaultTag(
  vendorId: string,
  tagId: string
): Promise<ActionResult<null>> {
  try {
    const { orgId } = await requireOrgContext();

    if (!(await verifyOrgEntity(orgId, "vendor", vendorId))) {
      return { success: false, error: "Vendor not found" };
    }

    await db.vendorDefaultTag.deleteMany({
      where: { vendorId, tagId },
    });

    return { success: true, data: null };
  } catch (error) {
    console.error("removeVendorDefaultTag error:", error);
    return { success: false, error: "Failed to remove default tag from vendor" };
  }
}

export async function setVendorDefaultTags(
  vendorId: string,
  tagIds: string[]
): Promise<ActionResult<null>> {
  try {
    const { orgId } = await requireOrgContext();

    if (!(await verifyOrgEntity(orgId, "vendor", vendorId))) {
      return { success: false, error: "Vendor not found" };
    }

    if (tagIds.length > 0) {
      const tags = await db.documentTag.findMany({
        where: { id: { in: tagIds }, orgId },
        select: { id: true },
      });
      const validIds = new Set(tags.map((t) => t.id));
      const invalidIds = tagIds.filter((id) => !validIds.has(id));
      if (invalidIds.length > 0) {
        return { success: false, error: `Tags not found: ${invalidIds.join(", ")}` };
      }
    }

    await db.$transaction([
      db.vendorDefaultTag.deleteMany({ where: { vendorId } }),
      ...tagIds.map((tagId) =>
        db.vendorDefaultTag.create({ data: { vendorId, tagId } })
      ),
    ]);

    return { success: true, data: null };
  } catch (error) {
    console.error("setVendorDefaultTags error:", error);
    return { success: false, error: "Failed to set vendor default tags" };
  }
}

export async function getVendorDefaultTags(
  vendorId: string
): Promise<ActionResult<TagData[]>> {
  try {
    const { orgId } = await requireOrgContext();

    if (!(await verifyOrgEntity(orgId, "vendor", vendorId))) {
      return { success: false, error: "Vendor not found" };
    }

    const defaults = await db.vendorDefaultTag.findMany({
      where: { vendorId },
      include: { tag: true },
      orderBy: { tag: { name: "asc" } },
    });

    return { success: true, data: defaults.map((d) => d.tag as TagData) };
  } catch (error) {
    console.error("getVendorDefaultTags error:", error);
    return { success: false, error: "Failed to get vendor default tags" };
  }
}
