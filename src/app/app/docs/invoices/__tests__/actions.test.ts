import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
    invoice: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    invoiceStateEvent: {
      create: vi.fn(),
    },
    publicInvoiceToken: {
      create: vi.fn(),
    },
    stockEvent: {
      findMany: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
    },
  },
}));

// Phase 19.2: mock document-events so fire-and-forget emits don't error
vi.mock("@/lib/document-events", () => ({
  emitInvoiceEvent: vi.fn().mockResolvedValue(undefined),
  emitVoucherEvent: vi.fn().mockResolvedValue(undefined),
  emitSalarySlipEvent: vi.fn().mockResolvedValue(undefined),
  emitQuoteEvent: vi.fn().mockResolvedValue(undefined),
  createDocEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: vi.fn(),
}));

vi.mock("@/lib/docs", () => ({
  nextDocumentNumber: vi.fn(),
}));

vi.mock("@/lib/prisma-errors", () => ({
  getSchemaDriftActionMessage: vi.fn(),
  isSchemaDriftError: vi.fn().mockReturnValue(false),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/invoice-reconciliation", () => ({
  reconcileInvoicePayment: vi.fn(),
  validatePaymentAmount: vi.fn(),
}));

vi.mock("@/lib/accounting", () => ({
  postInvoiceIssueTx: vi.fn(),
  postInvoicePaymentTx: vi.fn(),
  reverseJournalEntryTx: vi.fn(),
}));

vi.mock("@/lib/docs-vault", () => ({
  syncInvoiceToIndex: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/flow/workflow-engine", () => ({
  fireWorkflowTrigger: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/usage-metering", () => ({
  checkUsageLimit: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByOrg: vi.fn(),
  RATE_LIMITS: { invoiceIssue: { maxRequests: 30, window: "60 s" } },
}));

vi.mock("@/lib/inventory/stock-events", () => ({
  getOutboundUnitCostTx: vi.fn().mockResolvedValue(125),
  recordStockEventTx: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/features/sequences/services/sequence-engine", () => ({
  consumeSequenceNumber: vi.fn(),
}));

vi.mock("@/features/sequences/services/sequence-admin", () => ({
  getSequenceConfig: vi.fn(),
}));

import { requireOrgContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { nextDocumentNumber } from "@/lib/docs";
import { reverseJournalEntryTx } from "@/lib/accounting";
import { recordStockEventTx } from "@/lib/inventory/stock-events";
import { checkUsageLimit } from "@/lib/usage-metering";
import { rateLimitByOrg } from "@/lib/rate-limit";
import { consumeSequenceNumber } from "@/features/sequences/services/sequence-engine";
import { getSequenceConfig } from "@/features/sequences/services/sequence-admin";
import { cancelInvoice, issueInvoice, listInvoices, reissueInvoice, saveInvoice, updateInvoice } from "../actions";

const ORG_ID = "org-1";
const USER_ID = "user-1";

function txProxy() {
  vi.mocked(db.$transaction).mockImplementation(async (input: any) => input(db));
}

describe("invoice accounting transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txProxy();
    vi.mocked(requireOrgContext).mockResolvedValue({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "admin",
    });
    vi.mocked(checkUsageLimit).mockResolvedValue({
      allowed: true,
      current: 0,
      limit: 999,
    });
  });

  it("normalizes date-only strings before creating an invoice", async () => {
    vi.mocked(nextDocumentNumber).mockResolvedValue("INV-001");
    vi.mocked(db.invoice.create).mockResolvedValue({
      id: "inv-1",
      invoiceNumber: "INV-001",
      status: "DRAFT",
      customerId: null,
      totalAmount: 1000,
    } as any);

    const result = await saveInvoice(
      {
        invoiceDate: "2026-04-23",
        dueDate: "2026-05-07",
        formData: { source: "test" },
        lineItems: [
          {
            description: "Consulting",
            quantity: 1,
            unitPrice: 1000,
            taxRate: 0,
            discount: 0,
          },
        ],
      },
      "DRAFT",
    );

    expect(result.success).toBe(true);
    expect(db.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invoiceDate: expect.any(Date),
        dueDate: expect.any(Date),
      }),
    });
  });

  it("loads pending proof and active ticket activity for invoice vault rows", async () => {
    vi.mocked(db.invoice.findMany).mockResolvedValue([
      {
        id: "inv-1",
        invoiceNumber: "INV-001",
        status: "VIEWED",
        invoiceDate: new Date("2026-03-26T00:00:00Z"),
        dueDate: new Date("2026-04-02T00:00:00Z"),
        totalAmount: 53100,
        customer: { name: "Axis PeopleX" },
        publicTokens: [{ token: "pub-1" }],
        proofs: [{ id: "proof-1", createdAt: new Date("2026-04-23T10:00:00Z") }],
        tickets: [
          {
            id: "ticket-1",
            status: "OPEN",
            category: "BILLING_QUERY",
            createdAt: new Date("2026-04-23T11:00:00Z"),
          },
        ],
      },
    ] as any);
    vi.mocked(db.invoice.count).mockResolvedValue(1);

    const result = await listInvoices({ page: 1, limit: 20 });

    expect(result.invoices).toHaveLength(1);
    expect(db.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          proofs: expect.objectContaining({
            where: { reviewStatus: "PENDING" },
            take: 2,
          }),
          tickets: expect.objectContaining({
            where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
            take: 2,
          }),
        }),
      }),
    );
    expect(result.invoices[0]?.proofs?.[0]?.id).toBe("proof-1");
    expect(result.invoices[0]?.tickets?.[0]?.id).toBe("ticket-1");
  });

  it("reverses the posted issue journal when cancelling an unpaid posted invoice", async () => {
    vi.mocked(db.invoice.findFirst).mockResolvedValue({
      id: "inv-1",
      organizationId: ORG_ID,
      invoiceNumber: "INV-001",
      status: "ISSUED",
      amountPaid: 0,
      postedJournalEntryId: "journal-1",
      accountingStatus: "POSTED",
    } as any);
    vi.mocked(reverseJournalEntryTx).mockResolvedValue({
      id: "reversal-1",
    } as any);
    vi.mocked(db.stockEvent.findMany).mockResolvedValue([]);
    vi.mocked(db.invoice.update).mockResolvedValue({} as any);
    vi.mocked(db.invoiceStateEvent.create).mockResolvedValue({} as any);

    const result = await cancelInvoice("inv-1", "Customer requested cancellation");

    expect(result.success).toBe(true);
    expect(reverseJournalEntryTx).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        orgId: ORG_ID,
        journalEntryId: "journal-1",
        actorId: USER_ID,
      }),
    );
    expect(db.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: {
        status: "CANCELLED",
        accountingStatus: "REVERSED",
        revenueRecognitionStatus: "PENDING",
      },
    });
    expect(db.invoiceStateEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invoiceId: "inv-1",
        toStatus: "CANCELLED",
        metadata: { reversalJournalId: "reversal-1" },
      }),
    });
  });

  it("blocks reissue when settled payments already exist", async () => {
    vi.mocked(db.invoice.findFirst).mockResolvedValue({
      id: "inv-1",
      organizationId: ORG_ID,
      invoiceNumber: "INV-001",
      status: "PAID",
      amountPaid: 2500,
      postedJournalEntryId: "journal-1",
      accountingStatus: "POSTED",
      lineItems: [],
    } as any);

    const result = await reissueInvoice("inv-1", "Rate correction");

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain(
      "recorded settled payments",
    );
    expect(reverseJournalEntryTx).not.toHaveBeenCalled();
    expect(db.invoice.create).not.toHaveBeenCalled();
  });

  it("creates a replacement invoice and records reversal metadata when reissuing an unpaid posted invoice", async () => {
    vi.mocked(db.invoice.findFirst).mockResolvedValue({
      id: "inv-1",
      organizationId: ORG_ID,
      customerId: "cust-1",
      invoiceNumber: "INV-001",
      invoiceDate: "2026-04-01",
      dueDate: "2026-04-15",
      status: "PAID",
      amountPaid: 0,
      postedJournalEntryId: "journal-1",
      accountingStatus: "POSTED",
      notes: "Original invoice",
      formData: { template: "standard" },
      totalAmount: 1180,
      lineItems: [
        {
          description: "Consulting",
          inventoryItemId: "item-1",
          quantity: 1,
          unitPrice: 1000,
          taxRate: 18,
          discount: 0,
          amount: 1180,
          sortOrder: 0,
        },
      ],
    } as any);
    vi.mocked(nextDocumentNumber).mockResolvedValue("INV-002");
    vi.mocked(reverseJournalEntryTx).mockResolvedValue({
      id: "reversal-1",
    } as any);
    vi.mocked(db.invoice.create).mockResolvedValue({
      id: "inv-2",
    } as any);
    vi.mocked(db.invoice.update).mockResolvedValue({} as any);
    vi.mocked(db.invoiceStateEvent.create).mockResolvedValue({} as any);

    const result = await reissueInvoice("inv-1", "Correcting customer details");

    expect(result.success).toBe(true);
    expect(db.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORG_ID,
        invoiceNumber: null,
        originalId: "inv-1",
        lineItems: {
          create: [
            expect.objectContaining({
              inventoryItemId: "item-1",
            }),
          ],
        },
      }),
    });
    expect(db.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: {
        status: "REISSUED",
        reissueReason: "Correcting customer details",
        accountingStatus: "REVERSED",
        revenueRecognitionStatus: "PENDING",
      },
    });
    expect(db.invoiceStateEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invoiceId: "inv-1",
        toStatus: "REISSUED",
        metadata: {
          newInvoiceId: "inv-2",
          newInvoiceNumber: null,
          reversalJournalId: "reversal-1",
        },
      }),
    });
  });

  it("restores dispatched inventory when cancelling an issued invoice", async () => {
    vi.mocked(db.invoice.findFirst).mockResolvedValue({
      id: "inv-1",
      organizationId: ORG_ID,
      invoiceNumber: "INV-001",
      status: "ISSUED",
      amountPaid: 0,
      postedJournalEntryId: null,
      accountingStatus: "PENDING",
    } as any);
    vi.mocked(db.stockEvent.findMany).mockResolvedValue([
      {
        id: "stock-1",
        inventoryItemId: "item-1",
        warehouseId: "wh-1",
        quantity: 3,
        unitCost: 125,
      },
    ] as any);
    vi.mocked(db.invoice.update).mockResolvedValue({} as any);
    vi.mocked(db.invoiceStateEvent.create).mockResolvedValue({} as any);
    vi.mocked(db.invoice.findUnique).mockResolvedValue({
      id: "inv-1",
      organizationId: ORG_ID,
      invoiceNumber: "INV-001",
      invoiceDate: "2026-04-01",
      status: "CANCELLED",
      totalAmount: 300,
      displayCurrency: "INR",
      archivedAt: null,
      customer: null,
    } as any);

    const result = await cancelInvoice("inv-1", "Customer cancelled before fulfilment");

    expect(result.success).toBe(true);
    expect(recordStockEventTx).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        orgId: ORG_ID,
        inventoryItemId: "item-1",
        warehouseId: "wh-1",
        quantity: 3,
        eventType: "RETURN_IN",
        referenceId: "inv-1",
        createdByUserId: USER_ID,
      }),
    );
  });

  it("returns the assigned invoice number when issuing a draft invoice", async () => {
    vi.mocked(rateLimitByOrg).mockResolvedValue({ success: true, remaining: 999 });

    vi.mocked(getSequenceConfig).mockResolvedValue({
      sequenceId: "seq-1",
      documentType: "INVOICE" as const,
      name: "Invoice",
      formatString: "INV-{SEQ}",
      periodicity: "MONTHLY" as const,
      startCounter: 1,
      counterPadding: 4,
    });

    vi.mocked(consumeSequenceNumber).mockResolvedValue({
      formattedNumber: "INV-0001",
      sequenceNumber: 1,
      periodId: "per-1",
    });

    vi.mocked(db.invoice.findFirst).mockResolvedValue({
      id: "inv-1",
      organizationId: ORG_ID,
      invoiceNumber: null,
      invoiceDate: new Date("2026-01-15"),
      status: "DRAFT",
      totalAmount: 1000,
      lineItems: [],
    } as any);

    vi.mocked(db.invoice.findUnique).mockResolvedValue({
      id: "inv-1",
      invoiceNumber: null,
      status: "DRAFT",
    } as any);

    vi.mocked(db.invoice.update).mockResolvedValue({} as any);
    vi.mocked(db.invoiceStateEvent.create).mockResolvedValue({} as any);
    vi.mocked(db.publicInvoiceToken.create).mockResolvedValue({} as any);

    const result = await issueInvoice("inv-1");

    expect(result.success).toBe(true);
    expect(result.success && result.data.invoiceNumber).toBe("INV-0001");
    expect(db.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-1" },
        data: expect.objectContaining({
          status: "ISSUED",
          invoiceNumber: "INV-0001",
          sequenceId: "seq-1",
          sequencePeriodId: "per-1",
          sequenceNumber: 1,
        }),
      }),
    );
  });

  // ─── Sprint 4.1: org-scoped customerId validation ─────────────────────────

  it("saveInvoice rejects cross-org customerId", async () => {
    // Customer lookup returns null — customer does not belong to this org
    vi.mocked(db.customer.findFirst).mockResolvedValue(null);

    const result = await saveInvoice(
      {
        customerId: "foreign-cust",
        invoiceDate: "2026-04-23",
        formData: { source: "test" },
        lineItems: [
          { description: "Test", quantity: 1, unitPrice: 100, taxRate: 0, discount: 0 },
        ],
      },
      "DRAFT",
    );

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain(
      "Customer not found or does not belong to this organisation",
    );
    expect(db.invoice.create).not.toHaveBeenCalled();
  });

  it("updateInvoice rejects cross-org customerId", async () => {
    vi.mocked(db.invoice.findFirst).mockResolvedValue({
      id: "inv-1",
      organizationId: ORG_ID,
      status: "DRAFT",
      accountingStatus: "PENDING",
      postedJournalEntryId: null,
    } as any);
    // Customer lookup returns null
    vi.mocked(db.customer.findFirst).mockResolvedValue(null);

    const result = await updateInvoice("inv-1", {
      customerId: "foreign-cust",
      invoiceDate: "2026-04-23",
      formData: { source: "test" },
      lineItems: [
        { description: "Test", quantity: 1, unitPrice: 100, taxRate: 0, discount: 0 },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain(
      "Customer not found or does not belong to this organisation",
    );
    expect(db.invoice.update).not.toHaveBeenCalled();
  });

  it("saveInvoice persists valid in-org customerId", async () => {
    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: "cust-valid",
    } as any);
    vi.mocked(db.invoice.create).mockResolvedValue({
      id: "inv-new",
      invoiceNumber: null,
      status: "DRAFT",
      customerId: "cust-valid",
      totalAmount: 100,
    } as any);

    const result = await saveInvoice(
      {
        customerId: "cust-valid",
        invoiceDate: "2026-04-23",
        formData: { source: "test" },
        lineItems: [
          { description: "Test", quantity: 1, unitPrice: 100, taxRate: 0, discount: 0 },
        ],
      },
      "DRAFT",
    );

    expect(result.success).toBe(true);
    expect(db.customer.findFirst).toHaveBeenCalledWith({
      where: { id: "cust-valid", organizationId: ORG_ID },
      select: { id: true },
    });
    expect(db.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: "cust-valid",
        }),
      }),
    );
  });

  it("saveInvoice allows blank/undefined customerId", async () => {
    vi.mocked(db.invoice.create).mockResolvedValue({
      id: "inv-new",
      invoiceNumber: null,
      status: "DRAFT",
      customerId: null,
      totalAmount: 100,
    } as any);

    const result = await saveInvoice(
      {
        invoiceDate: "2026-04-23",
        formData: { source: "test" },
        lineItems: [
          { description: "Test", quantity: 1, unitPrice: 100, taxRate: 0, discount: 0 },
        ],
      },
      "DRAFT",
    );

    expect(result.success).toBe(true);
    // Should not have attempted customer lookup
    expect(db.customer.findFirst).not.toHaveBeenCalled();
    expect(db.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: null,
        }),
      }),
    );
  });
});
