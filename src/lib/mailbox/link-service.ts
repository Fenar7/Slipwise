import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type {
  MailboxThreadLinkEntityType,
  MailboxThreadLinkRecord,
} from "./domain-types";
import { logMailboxAuditTx } from "./audit";
import { listMailboxConnectionsForMember } from "./visibility-service";

export class LinkServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "UNAUTHORIZED"
      | "NOT_FOUND"
      | "DUPLICATE"
      | "CROSS_ORG"
      | "INVALID_ENTITY",
  ) {
    super(message);
    this.name = "LinkServiceError";
  }
}

// ─── Public shapes ───────────────────────────────────────────────────────────

export interface LinkedRecordSummary {
  id: string;
  entityType: MailboxThreadLinkEntityType;
  entityId: string;
  entityRef: string;
  entityLabel: string;
  entityMeta: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface ThreadLinkListResult {
  links: LinkedRecordSummary[];
  suggestions: LinkedRecordSummary[];
}

// ─── Create link ─────────────────────────────────────────────────────────────

export async function createThreadLink(params: {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  threadId: string;
  entityType: MailboxThreadLinkEntityType;
  entityId: string;
}): Promise<LinkedRecordSummary> {
  const { orgId, userId, role, threadId, entityType, entityId } = params;

  // Verify thread access
  const { accessible } = await listMailboxConnectionsForMember(orgId, userId, role);
  const accessibleIds = accessible.map((c) => c.id);
  if (accessibleIds.length === 0) {
    throw new LinkServiceError("No accessible mailboxes", "UNAUTHORIZED");
  }

  const thread = await db.mailboxThread.findFirst({
    where: { id: threadId, orgId, mailboxConnectionId: { in: accessibleIds } },
  });
  if (!thread) {
    throw new LinkServiceError("Thread not found", "NOT_FOUND");
  }

  // Verify target record exists and belongs to same org
  const record = await fetchTargetRecord(entityType, entityId, orgId);
  if (!record) {
    throw new LinkServiceError("Target record not found", "NOT_FOUND");
  }

  // Prevent duplicate
  const existing = await db.mailboxThreadLink.findFirst({
    where: { threadId, entityType, entityId },
  });
  if (existing) {
    throw new LinkServiceError("Link already exists", "DUPLICATE");
  }

  // Auto-promote first link
  const existingLinks = await db.mailboxThreadLink.count({ where: { threadId } });
  const shouldBePrimary = existingLinks === 0;

  const summary = buildSummary(entityType, record, true);

  const link = await db.$transaction(async (tx) => {
    const created = await tx.mailboxThreadLink.create({
      data: {
        orgId,
        threadId,
        entityType,
        entityId,
        isPrimary: shouldBePrimary,
        createdBy: userId,
      },
    });

    if (shouldBePrimary) {
      await tx.mailboxThread.update({
        where: { id: threadId },
        data: { primaryLinkSummary: summary as Prisma.InputJsonValue },
      });
    }

    await logMailboxAuditTx(tx, {
      orgId,
      actorId: userId,
      action: "THREAD_LINKED",
      summary: `Linked thread to ${entityType.toLowerCase()} ${record.label ?? record.ref}`,
      threadId,
      metadata: {
        entityType,
        entityId,
        entityRef: record.ref,
        isPrimary: shouldBePrimary,
      },
    });

    return created;
  });

  return {
    id: link.id,
    entityType: link.entityType,
    entityId,
    entityRef: record.ref,
    entityLabel: record.label,
    entityMeta: record.meta,
    isPrimary: link.isPrimary,
    createdAt: link.createdAt.toISOString(),
  };
}

// ─── Delete link ───────────────────────────────────────────────────────────────

export async function deleteThreadLink(params: {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  threadId: string;
  linkId: string;
}): Promise<void> {
  const { orgId, userId, role, threadId, linkId } = params;

  // Verify thread access
  const { accessible } = await listMailboxConnectionsForMember(orgId, userId, role);
  const accessibleIds = accessible.map((c) => c.id);
  if (accessibleIds.length === 0) {
    throw new LinkServiceError("No accessible mailboxes", "UNAUTHORIZED");
  }

  const link = await db.mailboxThreadLink.findFirst({
    where: { id: linkId, orgId, threadId },
  });
  if (!link) {
    throw new LinkServiceError("Link not found", "NOT_FOUND");
  }

  await db.$transaction(async (tx) => {
    await tx.mailboxThreadLink.delete({ where: { id: linkId } });

    if (link.isPrimary) {
      await tx.mailboxThread.update({
        where: { id: threadId },
        data: { primaryLinkSummary: null },
      });
    }

    await logMailboxAuditTx(tx, {
      orgId,
      actorId: userId,
      action: "THREAD_UNLINKED",
      summary: `Unlinked thread from ${link.entityType.toLowerCase()}`,
      threadId,
      metadata: {
        entityType: link.entityType,
        entityId: link.entityId,
        wasPrimary: link.isPrimary,
      },
    });
  });
}

// ─── Set primary link ──────────────────────────────────────────────────────────

export async function setPrimaryLink(params: {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  threadId: string;
  linkId: string;
}): Promise<LinkedRecordSummary> {
  const { orgId, userId, role, threadId, linkId } = params;

  const { accessible } = await listMailboxConnectionsForMember(orgId, userId, role);
  const accessibleIds = accessible.map((c) => c.id);
  if (accessibleIds.length === 0) {
    throw new LinkServiceError("No accessible mailboxes", "UNAUTHORIZED");
  }

  const link = await db.mailboxThreadLink.findFirst({
    where: { id: linkId, orgId, threadId },
  });
  if (!link) {
    throw new LinkServiceError("Link not found", "NOT_FOUND");
  }

  const record = await fetchTargetRecord(link.entityType, link.entityId, orgId);
  if (!record) {
    throw new LinkServiceError("Target record not found", "NOT_FOUND");
  }

  const summary = buildSummary(link.entityType, record, true);

  const updated = await db.$transaction(async (tx) => {
    // Demote any existing primary
    await tx.mailboxThreadLink.updateMany({
      where: { threadId, isPrimary: true, id: { not: linkId } },
      data: { isPrimary: false },
    });

    // Promote target
    const promoted = await tx.mailboxThreadLink.update({
      where: { id: linkId },
      data: { isPrimary: true },
    });

    await tx.mailboxThread.update({
      where: { id: threadId },
      data: { primaryLinkSummary: summary as Prisma.InputJsonValue },
    });

    await logMailboxAuditTx(tx, {
      orgId,
      actorId: userId,
      action: "THREAD_LINKED",
      summary: `Set primary link to ${link.entityType.toLowerCase()} ${record.ref}`,
      threadId,
      metadata: {
        entityType: link.entityType,
        entityId: link.entityId,
        entityRef: record.ref,
        isPrimary: true,
      },
    });

    return promoted;
  });

  return {
    id: updated.id,
    entityType: updated.entityType,
    entityId: link.entityId,
    entityRef: record.ref,
    entityLabel: record.label,
    entityMeta: record.meta,
    isPrimary: updated.isPrimary,
    createdAt: updated.createdAt.toISOString(),
  };
}

// ─── List links + suggestions ────────────────────────────────────────────────

export async function listThreadLinks(params: {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  threadId: string;
}): Promise<ThreadLinkListResult> {
  const { orgId, userId, role, threadId } = params;

  const { accessible } = await listMailboxConnectionsForMember(orgId, userId, role);
  const accessibleIds = accessible.map((c) => c.id);
  if (accessibleIds.length === 0) {
    return { links: [], suggestions: [] };
  }

  const thread = await db.mailboxThread.findFirst({
    where: { id: threadId, orgId, mailboxConnectionId: { in: accessibleIds } },
    include: { messages: { orderBy: { sentAt: "desc" }, take: 1 } },
  });
  if (!thread) {
    return { links: [], suggestions: [] };
  }

  // Confirmed links
  const linkRows = await db.mailboxThreadLink.findMany({
    where: { orgId, threadId },
    orderBy: { createdAt: "desc" },
  });

  const links: LinkedRecordSummary[] = [];
  for (const row of linkRows) {
    const record = await fetchTargetRecord(row.entityType, row.entityId, orgId);
    if (record) {
      links.push({
        id: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        entityRef: record.ref,
        entityLabel: record.label,
        entityMeta: record.meta,
        isPrimary: row.isPrimary,
        createdAt: row.createdAt.toISOString(),
      });
    }
  }

  // Suggestions: on-the-fly from thread data
  const suggestions = await suggestLinks(thread, orgId, linkRows);

  return { links, suggestions };
}

// ─── Target record fetchers ────────────────────────────────────────────────────

interface TargetRecord {
  ref: string;
  label: string;
  meta: string;
}

async function fetchTargetRecord(
  entityType: MailboxThreadLinkEntityType,
  entityId: string,
  orgId: string,
): Promise<TargetRecord | null> {
  switch (entityType) {
    case "CUSTOMER": {
      const c = await db.customer.findFirst({
        where: { id: entityId, organizationId: orgId },
        select: { id: true, name: true, email: true, phone: true },
      });
      if (!c) return null;
      return {
        ref: c.email ?? c.phone ?? c.id.slice(-6),
        label: c.name,
        meta: c.email ? `Email: ${c.email}` : "",
      };
    }
    case "INVOICE": {
      const inv = await db.invoice.findFirst({
        where: { id: entityId, organizationId: orgId },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          totalAmount: true,
          dueDate: true,
          customer: { select: { name: true } },
        },
      });
      if (!inv) return null;
      return {
        ref: inv.invoiceNumber ?? inv.id.slice(-6),
        label: inv.customer?.name ?? "Invoice",
        meta: `₹${inv.totalAmount.toString()} · ${inv.status}${inv.dueDate ? ` · Due ${inv.dueDate.toISOString().slice(0, 10)}` : ""}`,
      };
    }
    case "VOUCHER": {
      const v = await db.voucher.findFirst({
        where: { id: entityId, organizationId: orgId },
        select: {
          id: true,
          voucherNumber: true,
          type: true,
          totalAmount: true,
          status: true,
        },
      });
      if (!v) return null;
      return {
        ref: v.voucherNumber ?? v.id.slice(-6),
        label: `${v.type} voucher`,
        meta: `₹${v.totalAmount.toString()} · ${v.status}`,
      };
    }
    case "QUOTE": {
      const q = await db.quote.findFirst({
        where: { id: entityId, orgId },
        select: {
          id: true,
          quoteNumber: true,
          title: true,
          totalAmount: true,
          status: true,
          validUntil: true,
        },
      });
      if (!q) return null;
      return {
        ref: q.quoteNumber,
        label: q.title,
        meta: `₹${q.totalAmount.toString()} · ${q.status}${q.validUntil ? ` · Valid until ${q.validUntil.toISOString().slice(0, 10)}` : ""}`,
      };
    }
    default:
      return null;
  }
}

function buildSummary(
  entityType: MailboxThreadLinkEntityType,
  record: TargetRecord,
  isPrimary: boolean,
): Record<string, unknown> {
  return {
    entityType,
    entityRef: record.ref,
    entityLabel: record.label,
    entityMeta: record.meta,
    isPrimary,
  };
}

// ─── Suggestion engine ───────────────────────────────────────────────────────

async function suggestLinks(
  thread: { subject: string; participantsSummary: Prisma.JsonValue },
  orgId: string,
  existingLinks: Array<{ entityType: MailboxThreadLinkEntityType; entityId: string }>,
): Promise<LinkedRecordSummary[]> {
  const suggestions: LinkedRecordSummary[] = [];
  const existingKeys = new Set(existingLinks.map((l) => `${l.entityType}:${l.entityId}`));

  // Extract participant emails
  const participants = Array.isArray(thread.participantsSummary)
    ? (thread.participantsSummary as Array<Record<string, unknown>>)
    : [];
  const emails = participants
    .map((p) => (typeof p.email === "string" ? p.email.toLowerCase().trim() : null))
    .filter(Boolean) as string[];

  // Suggest customers by email match
  if (emails.length > 0) {
    const customers = await db.customer.findMany({
      where: {
        organizationId: orgId,
        email: { in: emails, mode: "insensitive" },
      },
      select: { id: true, name: true, email: true, phone: true },
      take: 3,
    });
    for (const c of customers) {
      const key = `CUSTOMER:${c.id}`;
      if (existingKeys.has(key)) continue;
      suggestions.push({
        id: `suggest_customer_${c.id}`,
        entityType: "CUSTOMER",
        entityId: c.id,
        entityRef: c.email ?? c.phone ?? c.id.slice(-6),
        entityLabel: c.name,
        entityMeta: c.email ? `Matched by email: ${c.email}` : "Matched by contact",
        isPrimary: false,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // Suggest invoices by subject keyword match (invoice number patterns)
  const invMatches = extractDocumentNumbers(thread.subject, "INV");
  if (invMatches.length > 0) {
    const invoices = await db.invoice.findMany({
      where: {
        organizationId: orgId,
        invoiceNumber: { in: invMatches, mode: "insensitive" },
      },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        totalAmount: true,
        customer: { select: { name: true } },
      },
      take: 2,
    });
    for (const inv of invoices) {
      const key = `INVOICE:${inv.id}`;
      if (existingKeys.has(key)) continue;
      suggestions.push({
        id: `suggest_invoice_${inv.id}`,
        entityType: "INVOICE",
        entityId: inv.id,
        entityRef: inv.invoiceNumber ?? inv.id.slice(-6),
        entityLabel: inv.customer?.name ?? "Invoice",
        entityMeta: `₹${inv.totalAmount.toString()} · ${inv.status}`,
        isPrimary: false,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // Suggest quotes by subject keyword match
  const qteMatches = extractDocumentNumbers(thread.subject, "QTE");
  if (qteMatches.length > 0) {
    const quotes = await db.quote.findMany({
      where: {
        orgId,
        quoteNumber: { in: qteMatches, mode: "insensitive" },
      },
      select: { id: true, quoteNumber: true, title: true, totalAmount: true, status: true },
      take: 2,
    });
    for (const q of quotes) {
      const key = `QUOTE:${q.id}`;
      if (existingKeys.has(key)) continue;
      suggestions.push({
        id: `suggest_quote_${q.id}`,
        entityType: "QUOTE",
        entityId: q.id,
        entityRef: q.quoteNumber,
        entityLabel: q.title,
        entityMeta: `₹${q.totalAmount.toString()} · ${q.status}`,
        isPrimary: false,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return suggestions;
}

function extractDocumentNumbers(subject: string, prefix: string): string[] {
  const matches: string[] = [];
  // Match patterns like INV-2026-0012, QTE-2026-0089, etc.
  const regex = new RegExp(`${prefix}-\\d{4}-\\d+`, "gi");
  const found = subject.match(regex);
  if (found) {
    matches.push(...found);
  }
  return matches;
}

// ─── Re-sync primary link summary for a thread ─────────────────────────────────

export async function syncPrimaryLinkSummary(
  threadId: string,
  orgId: string,
): Promise<void> {
  const primary = await db.mailboxThreadLink.findFirst({
    where: { threadId, orgId, isPrimary: true },
  });
  if (!primary) {
    await db.mailboxThread.update({
      where: { id: threadId },
      data: { primaryLinkSummary: null },
    });
    return;
  }

  const record = await fetchTargetRecord(primary.entityType, primary.entityId, orgId);
  if (!record) {
    await db.mailboxThread.update({
      where: { id: threadId },
      data: { primaryLinkSummary: null },
    });
    return;
  }

  const summary = buildSummary(primary.entityType, record, true);
  await db.mailboxThread.update({
    where: { id: threadId },
    data: { primaryLinkSummary: summary as Prisma.InputJsonValue },
  });
}
