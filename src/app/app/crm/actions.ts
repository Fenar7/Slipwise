"use server";

import { db } from "@/lib/db";
import { requireOrgContext, requireRole } from "@/lib/auth";
import { CustomerLifecycleStage, VendorComplianceStatus } from "@/generated/prisma/client";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

// ─── CRM Notes ────────────────────────────────────────────────────────────────

export async function createCrmNote(data: {
  entityType: "customer" | "vendor";
  entityId: string;
  content: string;
  isPinned?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const { orgId, userId } = await requireOrgContext();

  // IDOR: verify entity belongs to org
  if (data.entityType === "customer") {
    const customer = await db.customer.findUnique({ where: { id: data.entityId } });
    if (!customer || customer.organizationId !== orgId) {
      return { success: false, error: "Customer not found." };
    }
  } else {
    const vendor = await db.vendor.findUnique({ where: { id: data.entityId } });
    if (!vendor || vendor.organizationId !== orgId) {
      return { success: false, error: "Vendor not found." };
    }
  }

  const note = await db.crmNote.create({
    data: {
      orgId,
      entityType: data.entityType,
      entityId: data.entityId,
      content: data.content,
      isPinned: data.isPinned ?? false,
      createdByUserId: userId,
    },
  });

  return { success: true, data: { id: note.id } };
}

export async function updateCrmNote(
  noteId: string,
  data: { content?: string; isPinned?: boolean }
): Promise<ActionResult<void>> {
  const { orgId } = await requireOrgContext();

  const note = await db.crmNote.findUnique({ where: { id: noteId } });
  if (!note || note.orgId !== orgId) {
    return { success: false, error: "Note not found." };
  }

  await db.crmNote.update({ where: { id: noteId }, data });
  return { success: true, data: undefined };
}

export async function deleteCrmNote(noteId: string): Promise<ActionResult<void>> {
  const { orgId } = await requireRole("admin");

  const note = await db.crmNote.findUnique({ where: { id: noteId } });
  if (!note || note.orgId !== orgId) {
    return { success: false, error: "Note not found." };
  }

  await db.crmNote.delete({ where: { id: noteId } });
  return { success: true, data: undefined };
}

// ─── Customer CRM Updates ─────────────────────────────────────────────────────

export async function updateCustomerCrmFields(
  customerId: string,
  data: {
    industry?: string;
    segment?: string;
    lifecycleStage?: CustomerLifecycleStage;
    source?: string;
    nextFollowUpAt?: Date | null;
    tags?: string[];
  }
): Promise<ActionResult<void>> {
  const { orgId } = await requireOrgContext();

  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.organizationId !== orgId) {
    return { success: false, error: "Customer not found." };
  }

  await db.customer.update({ where: { id: customerId }, data });
  return { success: true, data: undefined };
}

// ─── Vendor CRM Updates ───────────────────────────────────────────────────────

export async function updateVendorCrmFields(
  vendorId: string,
  data: {
    category?: string;
    paymentTermsDays?: number;
    rating?: number | null;
    complianceStatus?: VendorComplianceStatus;
    tags?: string[];
  }
): Promise<ActionResult<void>> {
  const { orgId } = await requireRole("admin");

  const vendor = await db.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor || vendor.organizationId !== orgId) {
    return { success: false, error: "Vendor not found." };
  }

  await db.vendor.update({ where: { id: vendorId }, data });
  return { success: true, data: undefined };
}

// ─── Customer Timeline ────────────────────────────────────────────────────────

export async function getCustomerTimeline(customerId: string) {
  const { orgId } = await requireOrgContext();

  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: { _count: { select: { quotes: true } } },
  });
  if (!customer || customer.organizationId !== orgId) return null;

  const [invoices, notes, quotes] = await Promise.all([
    db.invoice.findMany({
      where: { organizationId: orgId, customerId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, invoiceNumber: true, status: true, totalAmount: true, createdAt: true },
    }),
    db.crmNote.findMany({
      where: { orgId, entityType: "customer", entityId: customerId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.quote.findMany({
      where: { orgId, customerId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, quoteNumber: true, status: true, totalAmount: true, createdAt: true },
    }),
  ]);

  // Merge and sort by timestamp descending
  type TimelineEvent = {
    id: string;
    eventType: string;
    title: string;
    amount?: number;
    status?: string;
    timestamp: Date;
    referenceType: string;
    referenceId: string;
  };

  const events: TimelineEvent[] = [
    ...invoices.map((inv) => ({
      id: `inv-${inv.id}`,
      eventType: "INVOICE_CREATED",
      title: `Invoice ${inv.invoiceNumber}`,
      amount: inv.totalAmount,
      status: inv.status,
      timestamp: inv.createdAt,
      referenceType: "invoice",
      referenceId: inv.id,
    })),
    ...notes.map((n) => ({
      id: `note-${n.id}`,
      eventType: "NOTE_ADDED",
      title: n.content.slice(0, 80),
      timestamp: n.createdAt,
      referenceType: "crm_note",
      referenceId: n.id,
    })),
    ...quotes.map((q) => ({
      id: `quote-${q.id}`,
      eventType: "QUOTE_SENT",
      title: `Quote ${q.quoteNumber}`,
      amount: q.totalAmount,
      status: q.status,
      timestamp: q.createdAt,
      referenceType: "quote",
      referenceId: q.id,
    })),
  ];

  events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return { customer, events };
}

// ─── Vendor Timeline ──────────────────────────────────────────────────────────

export async function getVendorTimeline(vendorId: string) {
  const { orgId } = await requireOrgContext();

  const vendor = await db.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor || vendor.organizationId !== orgId) return null;

  const [bills, notes, purchaseOrders] = await Promise.all([
    db.vendorBill.findMany({
      where: { orgId, vendorId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, billNumber: true, status: true, totalAmount: true, createdAt: true },
    }),
    db.crmNote.findMany({
      where: { orgId, entityType: "vendor", entityId: vendorId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.purchaseOrder.findMany({
      where: { orgId, vendorId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, poNumber: true, status: true, totalAmount: true, createdAt: true },
    }),
  ]);

  type TimelineEvent = {
    id: string;
    eventType: string;
    title: string;
    amount?: number;
    status?: string;
    timestamp: Date;
    referenceType: string;
    referenceId: string;
  };

  const events: TimelineEvent[] = [
    ...bills.map((b) => ({
      id: `bill-${b.id}`,
      eventType: "VENDOR_BILL_CREATED",
      title: `Vendor Bill ${b.billNumber}`,
      amount: Number(b.totalAmount),
      status: b.status,
      timestamp: b.createdAt,
      referenceType: "vendor_bill",
      referenceId: b.id,
    })),
    ...notes.map((n) => ({
      id: `note-${n.id}`,
      eventType: "NOTE_ADDED",
      title: n.content.slice(0, 80),
      timestamp: n.createdAt,
      referenceType: "crm_note",
      referenceId: n.id,
    })),
    ...purchaseOrders.map((po) => ({
      id: `po-${po.id}`,
      eventType: "PO_CREATED",
      title: `Purchase Order ${po.poNumber}`,
      amount: Number(po.totalAmount),
      status: po.status,
      timestamp: po.createdAt,
      referenceType: "purchase_order",
      referenceId: po.id,
    })),
  ];

  events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return { vendor, events };
}

// ─── CRM Dashboard ────────────────────────────────────────────────────────────

export async function getCrmDashboard() {
  const { orgId } = await requireOrgContext();

  const now = new Date();
  const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [
    lifecycleBreakdown,
    vendorCompliance,
    upcomingFollowUps,
    overdueFollowUps,
    atRiskCustomers,
    recentNotes,
    recentInvoices,
    recentQuotes,
  ] = await Promise.all([
    db.customer.groupBy({
      by: ["lifecycleStage"],
      where: { organizationId: orgId },
      _count: { id: true },
    }),
    db.vendor.groupBy({
      by: ["complianceStatus"],
      where: { organizationId: orgId },
      _count: { id: true },
    }),
    db.customer.findMany({
      where: {
        organizationId: orgId,
        nextFollowUpAt: { gte: now, lte: sevenDaysLater },
      },
      orderBy: { nextFollowUpAt: "asc" },
      take: 10,
      select: { id: true, name: true, email: true, nextFollowUpAt: true, lifecycleStage: true },
    }),
    db.customer.findMany({
      where: {
        organizationId: orgId,
        nextFollowUpAt: { lt: now },
      },
      orderBy: { nextFollowUpAt: "asc" },
      take: 10,
      select: { id: true, name: true, email: true, nextFollowUpAt: true, lifecycleStage: true },
    }),
    db.customer.findMany({
      where: {
        organizationId: orgId,
        lifecycleStage: { in: ["AT_RISK", "CHURNED"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, name: true, email: true, lifecycleStage: true, totalInvoiced: true },
    }),
    db.crmNote.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.invoice.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, invoiceNumber: true, status: true, totalAmount: true, createdAt: true, customerId: true, customer: { select: { name: true } } },
    }),
    db.quote.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, quoteNumber: true, status: true, totalAmount: true, createdAt: true, customerId: true, customer: { select: { name: true } } },
    }),
  ]);

  return { lifecycleBreakdown, vendorCompliance, upcomingFollowUps, overdueFollowUps, atRiskCustomers, recentNotes, recentInvoices, recentQuotes };
}
