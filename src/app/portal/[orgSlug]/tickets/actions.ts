"use server";

import { db } from "@/lib/db";
import { requirePortalSession } from "@/lib/portal-auth";
import { revalidatePath } from "next/cache";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const PAGE_SIZE = 20;

// ─── List Portal Tickets ──────────────────────────────────────────────────────

export interface PortalTicketItem {
  id: string;
  category: string;
  description: string;
  status: string;
  createdAt: Date;
  lastActivityAt: Date;
  invoiceNumber: string;
  unreadCount?: number;
}

export async function listPortalTickets(params?: {
  status?: string;
  search?: string;
  page?: number;
  orgSlug?: string;
}): Promise<ActionResult<{ tickets: PortalTicketItem[]; total: number }>> {
  try {
    const { customerId, orgId } = await requirePortalSession(params?.orgSlug);
    const page = params?.page ?? 1;
    const skip = (page - 1) * PAGE_SIZE;

    // Security: Only tickets related to invoices owned by this customer
    const where = {
      orgId,
      invoice: {
        customerId,
      },
      ...(params?.status ? { status: params.status as "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" } : {}),
      ...(params?.search
        ? {
            OR: [
              { description: { contains: params.search, mode: "insensitive" as const } },
              { invoice: { invoiceNumber: { contains: params.search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    const [tickets, total] = await Promise.all([
      db.invoiceTicket.findMany({
        where,
        include: {
          invoice: { select: { invoiceNumber: true } },
          replies: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: PAGE_SIZE,
      }),
      db.invoiceTicket.count({ where }),
    ]);

    const formatted = tickets.map((t) => ({
      id: t.id,
      category: t.category,
      description: t.description,
      status: t.status,
      createdAt: t.createdAt,
      lastActivityAt: t.replies[0]?.createdAt ?? t.createdAt,
      invoiceNumber: t.invoice.invoiceNumber,
    }));

    return { success: true, data: { tickets: formatted, total } };
  } catch (error) {
    console.error("[portal-tickets] listPortalTickets error:", error);
    return { success: false, error: "Failed to load tickets" };
  }
}

// ─── Get Ticket Detail ────────────────────────────────────────────────────────

export async function getPortalTicketDetail(ticketId: string, orgSlug?: string) {
  try {
    const { customerId, orgId } = await requirePortalSession(orgSlug);

    const ticket = await db.invoiceTicket.findFirst({
      where: {
        id: ticketId,
        orgId,
        invoice: {
          customerId,
        },
      },
      include: {
        invoice: { select: { id: true, invoiceNumber: true } },
        replies: {
          where: { isInternal: false },
          orderBy: { createdAt: "asc" },
          include: {
            attachments: {
              select: {
                id: true,
                fileName: true,
                size: true,
                mimeType: true,
                storageKey: true,
              },
            },
          },
        },
      },
    });

    if (!ticket) return null;

    try {
      const { recordExternalEvent } = await import("@/lib/portal-signals");
      await recordExternalEvent({
        orgId,
        customerId,
        eventType: "TICKET_VIEWED",
        resourceType: "InvoiceTicket",
        resourceId: ticketId,
      });
    } catch {}

    return ticket;
  } catch (error) {
    console.error("[portal-tickets] getPortalTicketDetail error:", error);
    return null;
  }
}

// ─── Submit Portal Reply ─────────────────────────────────────────────────────

export async function submitPortalTicketReply(
  ticketId: string,
  data: { message: string, attachmentIds?: string[] },
  orgSlug?: string
): Promise<ActionResult<{ replyId: string }>> {
  try {
    const { customerId, orgId, orgSlug: sessionOrgSlug } = await requirePortalSession(orgSlug);

    if (!data.message.trim()) {
      return { success: false, error: "Message is required" };
    }

    // Security check: Verify ticket belongs to customer
    const ticket = await db.invoiceTicket.findFirst({
      where: {
        id: ticketId,
        orgId,
        invoice: { customerId },
      },
      include: {
        invoice: { select: { customerId: true } },
      },
    });

    if (!ticket) {
      return { success: false, error: "Ticket not found or access denied" };
    }

    if (ticket.status === "CLOSED") {
      return { success: false, error: "Cannot reply to a closed ticket." };
    }

    // Idempotency: avoid double-submit within 1 min
    const existing = await db.ticketReply.findFirst({
      where: {
        ticketId,
        portalCustomerId: customerId,
        message: data.message.trim(),
        createdAt: { gte: new Date(Date.now() - 60000) },
      },
    });

    if (existing) {
      return { success: true, data: { replyId: existing.id } };
    }

    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: { name: true },
    });

    const reply = await db.ticketReply.create({
      data: {
        ticketId,
        portalCustomerId: customerId,
        authorName: customer?.name ?? "Customer",
        isInternal: false,
        message: data.message.trim(),
      },
    });

    // Link attachments if provided
    if (data.attachmentIds && data.attachmentIds.length > 0) {
      await db.fileAttachment.updateMany({
        where: {
          id: { in: data.attachmentIds },
          organizationId: orgId,
          entityId: "temp", // Usually uploaded with temp entityId
        },
        data: {
          entityType: "ticket_reply",
          entityId: reply.id,
        },
      });
    }

    try {
      const { recordExternalEvent } = await import("@/lib/portal-signals");
      await recordExternalEvent({
        orgId,
        customerId,
        eventType: "TICKET_REPLY_SUBMITTED",
        resourceType: "TicketReply",
        resourceId: reply.id,
        metadata: { ticketId },
      });
    } catch {}

    const targetOrgSlug = orgSlug || sessionOrgSlug;
    revalidatePath(`/portal/${targetOrgSlug}/tickets`);
    revalidatePath(`/portal/${targetOrgSlug}/tickets/${ticketId}`);
    return { success: true, data: { replyId: reply.id } };
  } catch (error) {
    console.error("[portal-tickets] submitPortalTicketReply error:", error);
    return { success: false, error: "Failed to send reply" };
  }
}
