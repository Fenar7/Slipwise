"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatIsoDate, toAccountingNumber } from "@/lib/accounting/utils";
import {
  getPortalSession,
  requestMagicLink,
  logPortalAccess,
  requestPortalOtp,
  verifyPortalOtp,
} from "@/lib/portal-auth";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type PortalActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function requireSession() {
  const session = await getPortalSession();
  if (!session) redirect("/portal");
  return session;
}

async function resolveOrgId(orgSlug: string, expectedOrgId: string): Promise<void> {
  const org = await db.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true },
  });
  if (!org || org.id !== expectedOrgId) {
    throw new Error("Unauthorized");
  }
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

// ─── 1. Request Magic Link ─────────────────────────────────────────────────────

export async function requestPortalMagicLink(email: string, orgSlug: string) {
  // Always return same shape to prevent email enumeration
  try {
    await requestMagicLink(email, orgSlug);
  } catch {
    // Swallow errors — anti-enumeration
  }
  return {
    success: true,
    message:
      "If an account exists with that email, we've sent a login link. Please check your inbox.",
  };
}

// ─── 1b. Request & Verify OTP (Sprint 5.2) ──────────────────────────────────────

export async function requestPortalOtpAction(email: string, orgSlug: string) {
  // Always return same shape to prevent email enumeration
  try {
    await requestPortalOtp(email, orgSlug);
  } catch {
    // Swallow errors — anti-enumeration
  }
  return {
    success: true as const,
    message: "If an account exists for this email, a verification code has been sent. Please check your inbox.",
  };
}

export async function verifyPortalOtpAction(
  email: string,
  otp: string,
  orgSlug: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const result = await verifyPortalOtp(email, otp, orgSlug);
    if (result.success) {
      return { success: true };
    } else {
      if (result.error === "rate_limit_exceeded") {
        return { success: false, error: "Too many failed attempts. Please try again later." };
      }
      return { success: false, error: "Invalid or expired verification code." };
    }
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

// ─── 2. Get Portal Invoices ────────────────────────────────────────────────────

export async function getPortalInvoices(orgSlug: string) {
  const session = await requireSession();
  await resolveOrgId(orgSlug, session.orgId);

  const invoices = await db.invoice.findMany({
    where: {
      organizationId: session.orgId,
      customerId: session.customerId,
      status: { not: "DRAFT" },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      dueDate: true,
      totalAmount: true,
      amountPaid: true,
      remainingAmount: true,
      status: true,
    },
  });

  return invoices.map((invoice) => ({
    ...invoice,
    invoiceDate: formatIsoDate(invoice.invoiceDate),
    dueDate: invoice.dueDate ? formatIsoDate(invoice.dueDate) : null,
    totalAmount: toAccountingNumber(invoice.totalAmount),
    amountPaid: toAccountingNumber(invoice.amountPaid),
    remainingAmount: toAccountingNumber(invoice.remainingAmount),
  }));
}

// ─── 3. Get Single Invoice Detail (with IDOR check) ───────────────────────────

export async function getPortalInvoiceDetail(
  orgSlug: string,
  invoiceId: string,
) {
  const session = await requireSession();
  await resolveOrgId(orgSlug, session.orgId);

  const invoice = await db.invoice.findFirst({
    where: {
      id: invoiceId,
      organizationId: session.orgId,
      customerId: session.customerId,
    },
    include: {
      lineItems: true,
      payments: {
        where: { status: "SETTLED" },
        orderBy: { paidAt: "desc" },
        select: {
          id: true,
          amount: true,
          paidAt: true,
          method: true,
          note: true,
          status: true,
          paymentMethodDisplay: true,
        },
      },
      organization: {
        select: {
          name: true,
          defaults: {
            select: {
              bankName: true,
              bankAccount: true,
              bankIFSC: true,
            },
          },
        },
      },
      customer: {
        select: { name: true, email: true, phone: true },
      },
    },
  });

  if (!invoice) return null;

  logPortalAccess({
    orgId: session.orgId,
    customerId: session.customerId,
    path: `/portal/${orgSlug}/invoices/${invoiceId}`,
    action: "view_invoice",
  });

  const hasValidPaymentLink = !!(
    invoice.razorpayPaymentLinkUrl &&
    invoice.paymentLinkExpiresAt &&
    invoice.paymentLinkExpiresAt > new Date()
  );

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber ?? "—",
    invoiceDate: formatIsoDate(invoice.invoiceDate),
    dueDate: invoice.dueDate ? formatIsoDate(invoice.dueDate) : null,
    totalAmount: toAccountingNumber(invoice.totalAmount),
    amountPaid: toAccountingNumber(invoice.amountPaid),
    remainingAmount: toAccountingNumber(invoice.remainingAmount),
    status: invoice.status,
    hasValidPaymentLink,
    fromName: invoice.organization.name,
    clientName: invoice.customer.name,
    organization: invoice.organization,
    lineItems: invoice.lineItems.map((item) => ({
      id: item.id,
      name: item.description,
      quantity: item.quantity,
      price: toAccountingNumber(item.unitPrice),
      total: toAccountingNumber(item.amount),
    })),
    payments: invoice.payments.map((pmt) => ({
      id: pmt.id,
      amount: toAccountingNumber(pmt.amount),
      paidAt: formatIsoDate(pmt.paidAt),
      method: pmt.method ?? "—",
      note: pmt.note ?? "—",
      status: pmt.status,
      paymentMethodDisplay: pmt.paymentMethodDisplay ?? "—",
    })),
  };
}

// ─── 4. Generate Statement ─────────────────────────────────────────────────────

export async function generatePortalStatement(
  orgSlug: string,
  fromDate: string,
  toDate: string,
) {
  const session = await requireSession();
  await resolveOrgId(orgSlug, session.orgId);

  // Enforce portalEnabled + portalStatementEnabled policy
  const orgDefaults = await db.orgDefaults.findUnique({
    where: { organizationId: session.orgId },
    select: { portalEnabled: true, portalStatementEnabled: true },
  });
  if (!orgDefaults?.portalEnabled) {
    throw new Error("Portal is not enabled for this organization");
  }
  if (!orgDefaults.portalStatementEnabled) {
    throw new Error("Statement generation is not enabled for this portal");
  }

  const from = new Date(fromDate);
  const to = new Date(toDate);

  // Get invoices in the period
  const invoices = await db.invoice.findMany({
    where: {
      organizationId: session.orgId,
      customerId: session.customerId,
      status: { not: "DRAFT" },
      createdAt: { gte: from, lte: to },
    },
    select: { totalAmount: true, amountPaid: true },
  });

  const totalInvoiced = invoices.reduce((sum, invoice) => {
    return sum + toAccountingNumber(invoice.totalAmount);
  }, 0);
  const totalReceived = invoices.reduce((sum, invoice) => {
    return sum + toAccountingNumber(invoice.amountPaid);
  }, 0);

  // Opening balance: sum of remaining amounts for invoices BEFORE the period
  const olderInvoices = await db.invoice.findMany({
    where: {
      organizationId: session.orgId,
      customerId: session.customerId,
      status: { not: "DRAFT" },
      createdAt: { lt: from },
    },
    select: { remainingAmount: true },
  });
  const openingBalance = olderInvoices.reduce((sum, invoice) => {
    return sum + toAccountingNumber(invoice.remainingAmount);
  }, 0);
  const closingBalance = openingBalance + totalInvoiced - totalReceived;

  const statement = await db.customerStatement.create({
    data: {
      orgId: session.orgId,
      customerId: session.customerId,
      fromDate: from,
      toDate: to,
      openingBalance,
      closingBalance,
      totalInvoiced,
      totalReceived,
    },
  });

  logPortalAccess({
    orgId: session.orgId,
    customerId: session.customerId,
    path: `/portal/${orgSlug}/statements`,
    action: "generate_statement",
  });

  return {
    id: statement.id,
    fromDate: statement.fromDate.toISOString(),
    toDate: statement.toDate.toISOString(),
    openingBalance,
    closingBalance,
    totalInvoiced,
    totalReceived,
    formattedOpeningBalance: formatCurrency(openingBalance),
    formattedClosingBalance: formatCurrency(closingBalance),
    formattedTotalInvoiced: formatCurrency(totalInvoiced),
    formattedTotalReceived: formatCurrency(totalReceived),
  };
}

// ─── 5. Update Profile ─────────────────────────────────────────────────────────

export async function updatePortalProfile(
  orgSlug: string,
  data: { phone?: string; address?: string },
) {
  const session = await requireSession();
  await resolveOrgId(orgSlug, session.orgId);

  await db.customer.update({
    where: {
      id: session.customerId,
      organizationId: session.orgId,
    },
    data: {
      phone: data.phone,
      address: data.address,
    },
  });

  logPortalAccess({
    orgId: session.orgId,
    customerId: session.customerId,
    path: `/portal/${orgSlug}/profile/update`,
    action: "update_profile",
  });

  return { success: true };
}

// ─── 6. Initiate Payment ───────────────────────────────────────────────────────

export async function initiatePortalPayment(
  orgSlug: string,
  invoiceId: string,
) {
  const session = await requireSession();
  await resolveOrgId(orgSlug, session.orgId);

  // IDOR check: invoice must belong to this customer + org
  const invoice = await db.invoice.findFirst({
    where: {
      id: invoiceId,
      organizationId: session.orgId,
      customerId: session.customerId,
    },
    select: {
      id: true,
      razorpayPaymentLinkUrl: true,
      paymentLinkExpiresAt: true,
      remainingAmount: true,
      status: true,
    },
  });

  // Fail closed: invoice not found
  if (!invoice) {
    return { alreadyPaid: false, url: null, error: "Invoice not found." };
  }

  // Fail closed: already paid
  if (invoice.status === "PAID") {
    return { alreadyPaid: true, url: null, error: "This invoice has already been paid." };
  }

  // Fail closed: cancelled
  if (invoice.status === "CANCELLED") {
    return { alreadyPaid: false, url: null, error: "This invoice has been cancelled." };
  }

  // Fail closed: zero remaining balance
  if (invoice.remainingAmount <= 0) {
    return { alreadyPaid: false, url: null, error: "This invoice has no outstanding balance." };
  }

  // Return existing payment link if still valid
  if (
    invoice.razorpayPaymentLinkUrl &&
    invoice.paymentLinkExpiresAt &&
    invoice.paymentLinkExpiresAt > new Date()
  ) {
    return { alreadyPaid: false, url: invoice.razorpayPaymentLinkUrl };
  }

  logPortalAccess({
    orgId: session.orgId,
    customerId: session.customerId,
    path: `/portal/${orgSlug}/invoices/${invoiceId}/pay`,
    action: "initiate_payment",
  });

  // No usable payment link: return failure instead of redirecting to detached public invoice page
  return {
    alreadyPaid: false,
    url: null,
    error: "Online payment is not currently available for this invoice. Please use Bank Transfer or contact support.",
  };
}

// ─── 7. Get Portal Quotes ──────────────────────────────────────────────────────

export interface PortalQuoteListItem {
  id: string;
  quoteNumber: string;
  title: string;
  status: string;
  issueDate: Date;
  validUntil: Date;
  totalAmount: number;
  acceptedAt: Date | null;
  declinedAt: Date | null;
}

export async function getPortalQuotes(
  orgSlug: string,
): Promise<PortalActionResult<PortalQuoteListItem[]>> {
  try {
    const session = await requireSession();
    await resolveOrgId(orgSlug, session.orgId);

    const quotes = await db.quote.findMany({
      where: {
        orgId: session.orgId,
        customerId: session.customerId,
        status: { not: "DRAFT" },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        quoteNumber: true,
        title: true,
        status: true,
        issueDate: true,
        validUntil: true,
        totalAmount: true,
        acceptedAt: true,
        declinedAt: true,
      },
    });

    logPortalAccess({
      orgId: session.orgId,
      customerId: session.customerId,
      path: `/portal/${orgSlug}/quotes`,
      action: "list_quotes",
    });

    return {
      success: true,
      data: quotes.map((quote) => ({
        ...quote,
        totalAmount: toAccountingNumber(quote.totalAmount),
      })),
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load quotes" };
  }
}

// ─── 8. Get Portal Quote Detail ────────────────────────────────────────────────

export async function getPortalQuoteDetail(orgSlug: string, quoteId: string) {
  try {
    const session = await requireSession();
    await resolveOrgId(orgSlug, session.orgId);

    const [quote, orgDefaults] = await Promise.all([
      db.quote.findFirst({
        where: {
          id: quoteId,
          orgId: session.orgId,
          customerId: session.customerId,
          status: { not: "DRAFT" },
        },
        include: {
          lineItems: { orderBy: { sortOrder: "asc" } },
          org: { select: { name: true } },
          customer: { select: { name: true, email: true } },
        },
      }),
      db.orgDefaults.findUnique({
        where: { organizationId: session.orgId },
        select: { portalQuoteAcceptanceEnabled: true },
      }),
    ]);

    if (!quote) return { success: false as const, error: "not_found" as const };

    logPortalAccess({
      orgId: session.orgId,
      customerId: session.customerId,
      path: `/portal/${orgSlug}/quotes/${quoteId}`,
      action: "view_quote",
    });

    return {
      success: true as const,
      data: {
        ...quote,
        subtotal: toAccountingNumber(quote.subtotal),
        discountAmount: toAccountingNumber(quote.discountAmount),
        taxAmount: toAccountingNumber(quote.taxAmount),
        totalAmount: toAccountingNumber(quote.totalAmount),
        lineItems: quote.lineItems.map((item) => ({
          ...item,
          unitPrice: toAccountingNumber(item.unitPrice),
          taxRate: toAccountingNumber(item.taxRate),
          amount: toAccountingNumber(item.amount),
        })),
        canRespond:
          (orgDefaults?.portalQuoteAcceptanceEnabled ?? false) &&
          quote.status === "SENT" &&
          quote.validUntil >= new Date(),
      },
    };
  } catch (err) {
    return { success: false as const, error: err instanceof Error ? err.message : "Failed to load quote" };
  }
}

// ─── 9. Accept Portal Quote ────────────────────────────────────────────────────

export async function acceptPortalQuote(
  orgSlug: string,
  quoteId: string,
): Promise<PortalActionResult<{ quoteNumber: string }>> {
  try {
    const session = await requireSession();
    await resolveOrgId(orgSlug, session.orgId);

    // Check portal enabled + policy
    const orgDefaults = await db.orgDefaults.findUnique({
      where: { organizationId: session.orgId },
      select: { portalEnabled: true, portalQuoteAcceptanceEnabled: true },
    });
    if (!orgDefaults?.portalEnabled) {
      return { success: false, error: "Portal is not available" };
    }
    if (!orgDefaults?.portalQuoteAcceptanceEnabled) {
      return { success: false, error: "Quote acceptance is not enabled for this portal" };
    }

    // IDOR + state check
    const quote = await db.quote.findFirst({
      where: {
        id: quoteId,
        orgId: session.orgId,
        customerId: session.customerId,
        status: "SENT",
        validUntil: { gte: new Date() },
      },
      select: { id: true, quoteNumber: true },
    });

    if (!quote) {
      return { success: false, error: "Quote not available for acceptance" };
    }

    const updated = await db.quote.update({
      where: { id: quote.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
      select: { quoteNumber: true, orgId: true, customerId: true },
    });

    logPortalAccess({
      orgId: session.orgId,
      customerId: session.customerId,
      path: `/portal/${orgSlug}/quotes/${quoteId}/accept`,
      action: "accept_quote",
    });

    // Sprint 25.1: fire quote.accepted workflow trigger
    const { fireWorkflowTrigger } = await import("@/lib/flow/workflow-engine");
    void fireWorkflowTrigger({
      triggerType: "quote.accepted",
      orgId: session.orgId,
      sourceModule: "quotes",
      sourceEntityType: "Quote",
      sourceEntityId: quoteId,
      actorId: session.customerId,
      payload: { quoteNumber: updated.quoteNumber, customerId: session.customerId },
    });

    return { success: true, data: { quoteNumber: updated.quoteNumber } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to accept quote" };
  }
}

// ─── 10. Decline Portal Quote ──────────────────────────────────────────────────

export async function declinePortalQuote(
  orgSlug: string,
  quoteId: string,
  reason?: string,
): Promise<PortalActionResult<{ quoteNumber: string }>> {
  try {
    const session = await requireSession();
    await resolveOrgId(orgSlug, session.orgId);

    // Check portal enabled + policy
    const orgDefaults = await db.orgDefaults.findUnique({
      where: { organizationId: session.orgId },
      select: { portalEnabled: true, portalQuoteAcceptanceEnabled: true },
    });
    if (!orgDefaults?.portalEnabled) {
      return { success: false, error: "Portal is not available" };
    }
    if (!orgDefaults?.portalQuoteAcceptanceEnabled) {
      return { success: false, error: "Quote responses are not enabled for this portal" };
    }

    // IDOR + state check
    const quote = await db.quote.findFirst({
      where: {
        id: quoteId,
        orgId: session.orgId,
        customerId: session.customerId,
        status: "SENT",
        validUntil: { gte: new Date() },
      },
      select: { id: true, quoteNumber: true },
    });

    if (!quote) {
      return { success: false, error: "Quote not available for response" };
    }

    const updated = await db.quote.update({
      where: { id: quote.id },
      data: {
        status: "DECLINED",
        declinedAt: new Date(),
        declineReason: reason ?? null,
      },
      select: { quoteNumber: true },
    });

    logPortalAccess({
      orgId: session.orgId,
      customerId: session.customerId,
      path: `/portal/${orgSlug}/quotes/${quoteId}/decline`,
      action: "decline_quote",
    });

    // Sprint 25.1: fire quote.declined workflow trigger
    const { fireWorkflowTrigger } = await import("@/lib/flow/workflow-engine");
    void fireWorkflowTrigger({
      triggerType: "quote.declined",
      orgId: session.orgId,
      sourceModule: "quotes",
      sourceEntityType: "Quote",
      sourceEntityId: quoteId,
      actorId: session.customerId,
      payload: { quoteNumber: updated.quoteNumber, reason: reason ?? null, customerId: session.customerId },
    });

    return { success: true, data: { quoteNumber: updated.quoteNumber } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to decline quote" };
  }
}

// ─── 11. Get Portal Client Hub Dashboard Data (Sprint 6.1) ──────────────────────

export async function getPortalDashboardData(orgSlug: string) {
  const session = await requireSession();
  await resolveOrgId(orgSlug, session.orgId);

  const customer = await db.customer.findFirst({
    where: {
      id: session.customerId,
      organizationId: session.orgId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
    },
  });

  if (!customer) {
    throw new Error("Customer not found");
  }

  // 1. Fetch total count of unpaid invoices
  const unpaidInvoicesCount = await db.invoice.count({
    where: {
      organizationId: session.orgId,
      customerId: session.customerId,
      status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
    },
  });

  // 2. Fetch outstanding balance (sum of remainingAmount of unpaid invoices)
  const outstandingBalanceSum = await db.invoice.aggregate({
    where: {
      organizationId: session.orgId,
      customerId: session.customerId,
      status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
    },
    _sum: {
      remainingAmount: true,
    },
  });
  const outstandingBalance = toAccountingNumber(outstandingBalanceSum._sum.remainingAmount ?? 0);

  // 3. Fetch total paid (sum of amountPaid of valid invoices)
  const totalPaidSum = await db.invoice.aggregate({
    where: {
      organizationId: session.orgId,
      customerId: session.customerId,
      status: { notIn: ["DRAFT", "CANCELLED"] },
    },
    _sum: {
      amountPaid: true,
    },
  });
  const totalPaid = toAccountingNumber(totalPaidSum._sum.amountPaid ?? 0);

  // 4. Fetch bounded recent pending invoices (limit to 5)
  const recentInvoices = await db.invoice.findMany({
    where: {
      organizationId: session.orgId,
      customerId: session.customerId,
      status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
    },
    orderBy: [
      { invoiceDate: "desc" },
      { createdAt: "desc" },
    ],
    take: 5,
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      dueDate: true,
      totalAmount: true,
      amountPaid: true,
      remainingAmount: true,
      status: true,
    },
  });

  // 5. Fetch count of pending quotes
  const pendingQuotesCount = await db.quote.count({
    where: {
      orgId: session.orgId,
      customerId: session.customerId,
      status: "SENT",
      validUntil: { gte: new Date() },
    },
  });

  // 6. Fetch bounded recent pending quotes (limit to 5)
  const recentQuotes = await db.quote.findMany({
    where: {
      orgId: session.orgId,
      customerId: session.customerId,
      status: "SENT",
      validUntil: { gte: new Date() },
    },
    orderBy: [
      { validUntil: "asc" }, // nearest deadline first
      { createdAt: "desc" },
    ],
    take: 5,
    select: {
      id: true,
      quoteNumber: true,
      title: true,
      status: true,
      issueDate: true,
      validUntil: true,
      totalAmount: true,
      acceptedAt: true,
      declinedAt: true,
    },
  });

  logPortalAccess({
    orgId: session.orgId,
    customerId: session.customerId,
    path: `/portal/${orgSlug}/client-hub`,
    action: "view_dashboard",
  });

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
    },
    outstandingBalance,
    totalPaid,
    pendingInvoicesCount: unpaidInvoicesCount,
    pendingQuotesCount: pendingQuotesCount,
    pendingInvoices: recentInvoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber ?? "—",
      dueDate: inv.dueDate ? formatIsoDate(inv.dueDate) : null,
      remainingAmount: toAccountingNumber(inv.remainingAmount),
      totalAmount: toAccountingNumber(inv.totalAmount),
      status: inv.status,
    })),
    pendingQuotes: recentQuotes.map((q) => ({
      id: q.id,
      quoteNumber: q.quoteNumber,
      title: q.title,
      validUntil: formatIsoDate(q.validUntil),
      totalAmount: toAccountingNumber(q.totalAmount),
      status: q.status,
    })),
  };
}

export async function getPortalPaymentsData(orgSlug: string) {
  const session = await requireSession();
  await resolveOrgId(orgSlug, session.orgId);

  const outstandingBalanceSum = await db.invoice.aggregate({
    where: {
      organizationId: session.orgId,
      customerId: session.customerId,
      status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
    },
    _sum: {
      remainingAmount: true,
    },
  });
  const outstandingBalance = toAccountingNumber(outstandingBalanceSum._sum.remainingAmount ?? 0);

  const totalPaidSum = await db.invoice.aggregate({
    where: {
      organizationId: session.orgId,
      customerId: session.customerId,
      status: { notIn: ["DRAFT", "CANCELLED"] },
    },
    _sum: {
      amountPaid: true,
    },
  });
  const totalPaid = toAccountingNumber(totalPaidSum._sum.amountPaid ?? 0);

  const payments = await db.invoicePayment.findMany({
    where: {
      orgId: session.orgId,
      status: "SETTLED",
      invoice: {
        customerId: session.customerId,
      },
    },
    orderBy: { paidAt: "desc" },
    include: {
      invoice: {
        select: {
          invoiceNumber: true,
        },
      },
    },
  });

  const outstandingInvoices = await db.invoice.findMany({
    where: {
      organizationId: session.orgId,
      customerId: session.customerId,
      status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
    },
    orderBy: { dueDate: "asc" },
    select: {
      id: true,
      invoiceNumber: true,
      dueDate: true,
      remainingAmount: true,
    },
  });

  const orgDefaults = await db.orgDefaults.findUnique({
    where: { organizationId: session.orgId },
    select: { bankName: true, bankAccount: true, bankIFSC: true },
  });

  const orgHasBankDetails = !!(
    orgDefaults?.bankName || orgDefaults?.bankAccount || orgDefaults?.bankIFSC
  );

  const validPaymentLinkInvoice = await db.invoice.findFirst({
    where: {
      organizationId: session.orgId,
      customerId: session.customerId,
      razorpayPaymentLinkUrl: { not: null },
      paymentLinkExpiresAt: { gt: new Date() },
      status: { notIn: ["PAID", "CANCELLED"] },
      remainingAmount: { gt: 0 },
    },
    select: { id: true },
  });
  const hasPaymentLink = !!validPaymentLinkInvoice;

  logPortalAccess({
    orgId: session.orgId,
    customerId: session.customerId,
    path: `/portal/${orgSlug}/payments`,
    action: "view_payments",
  });

  return {
    outstandingBalance,
    totalPaid,
    orgHasBankDetails,
    hasPaymentLink,
    payments: payments.map((pmt) => ({
      id: pmt.id,
      invoiceNumber: pmt.invoice.invoiceNumber ?? "—",
      amount: toAccountingNumber(pmt.amount),
      paidAt: formatIsoDate(pmt.paidAt),
      method: pmt.paymentMethodDisplay || pmt.method || "—",
      status: pmt.status,
    })),
    outstandingInvoices: outstandingInvoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber ?? "—",
      dueDate: inv.dueDate ? formatIsoDate(inv.dueDate) : null,
      remainingAmount: toAccountingNumber(inv.remainingAmount),
    })),
  };
}

