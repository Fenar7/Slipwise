import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
    voucher: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    voucherLine: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    vendor: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: vi.fn(),
}));

vi.mock("@/lib/docs", () => ({
  nextDocumentNumber: vi.fn(),
  nextDocumentNumberTx: vi.fn(),
}));

vi.mock("@/features/sequences/services/sequence-engine", () => ({
  consumeSequenceNumber: vi.fn(),
}));

vi.mock("@/features/sequences/services/sequence-admin", () => ({
  getSequenceConfig: vi.fn().mockResolvedValue(null), // no sequence → fallback
}));

vi.mock("@/lib/prisma-errors", () => ({
  getSchemaDriftActionMessage: vi.fn(),
  isSchemaDriftError: vi.fn().mockReturnValue(false),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/accounting", () => ({
  postVoucherTx: vi.fn(),
}));

vi.mock("@/lib/document-events", () => ({
  emitVoucherEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/docs-vault", () => ({
  syncVoucherToIndex: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/usage-metering", () => ({
  checkUsageLimit: vi.fn(),
}));

vi.mock("@/lib/flow/workflow-engine", () => ({
  fireWorkflowTrigger: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/tags/assignment-service", () => ({
  setVoucherTags: vi.fn(),
}));

vi.mock("../autofill-resolver", () => ({
  validateVoucherVendor: vi.fn().mockResolvedValue(undefined),
  resolveVoucherAutofill: vi.fn(),
}));

import { requireOrgContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { nextDocumentNumberTx } from "@/lib/docs";
import { postVoucherTx } from "@/lib/accounting";
import { checkUsageLimit } from "@/lib/usage-metering";
import { validateVoucherVendor } from "../autofill-resolver";
import { saveVoucher, updateVoucher } from "../actions";

const ORG_ID = "org-1";
const USER_ID = "user-1";

describe("voucher save actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => callback(db));
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

  it("rejects zero-value voucher lines before posting", async () => {
    const result = await saveVoucher(
      {
        voucherDate: "2026-04-23",
        type: "payment",
        formData: { source: "test" },
        lines: [{ description: "Office rent", amount: 0 }],
      },
      "approved",
    );

    expect(result).toEqual({
      success: false,
      error: "Voucher line amounts must be greater than zero.",
    });
    expect(db.voucher.create).not.toHaveBeenCalled();
    expect(postVoucherTx).not.toHaveBeenCalled();
  });

  it("saves draft vouchers even when the current form only has partial lines", async () => {
    vi.mocked(nextDocumentNumberTx).mockResolvedValue("VCH-001");
    vi.mocked(db.voucher.create).mockResolvedValue({
      id: "voucher-1",
      voucherNumber: "VCH-001",
      totalAmount: 1250,
      type: "payment",
    } as any);

    const result = await saveVoucher(
      {
        voucherDate: "2026-04-23",
        type: "payment",
        formData: {
          date: "2026-04-23",
          payee: "Landlord",
          lineItems: [{ description: "Office rent", amount: "" }],
        },
        lines: [{ description: "Office rent", amount: 0 }],
      },
      "draft",
    );

    expect(result.success).toBe(true);
    expect(postVoucherTx).not.toHaveBeenCalled();
    expect(vi.mocked(db.voucher.create).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: 0,
        }),
      }),
    );
    expect(vi.mocked(db.voucher.create).mock.calls[0]?.[0]?.data.lines).toBeUndefined();
  });

  it("updates draft vouchers without recreating incomplete line items", async () => {
    vi.mocked(db.voucher.findFirst).mockResolvedValue({
      id: "voucher-1",
      status: "draft",
      accountingStatus: "PENDING",
      totalAmount: 250,
    } as any);
    vi.mocked(db.voucher.update).mockResolvedValue({ id: "voucher-1" } as any);
    vi.mocked(db.voucherLine.deleteMany).mockResolvedValue({ count: 1 } as any);

    const result = await updateVoucher("voucher-1", {
      voucherDate: "2026-04-23",
      type: "payment",
      formData: {
        date: "2026-04-23",
        payee: "Landlord",
        lineItems: [{ description: "", amount: "" }],
      },
      lines: [{ description: "", amount: 0 }],
    });

    expect(result.success).toBe(true);
    expect(db.voucherLine.deleteMany).toHaveBeenCalledWith({
      where: { voucherId: "voucher-1" },
    });
    expect(db.voucherLine.createMany).not.toHaveBeenCalled();
    expect(postVoucherTx).not.toHaveBeenCalled();
  });

  it("posts approved vouchers once the normalized total is positive", async () => {
    vi.mocked(nextDocumentNumberTx).mockResolvedValue("VCH-001");
    vi.mocked(db.voucher.create).mockResolvedValue({
      id: "voucher-1",
      voucherNumber: "VCH-001",
      totalAmount: 1250,
      type: "draft",
    } as any);
    vi.mocked(db.voucher.findFirst).mockResolvedValue({
      id: "voucher-1",
      organizationId: ORG_ID,
      voucherNumber: "VCH-001",
      status: "approved",
      voucherDate: "2026-04-23",
      totalAmount: 1250,
      type: "payment",
      archivedAt: null,
      vendor: null,
    } as any);

    const result = await saveVoucher(
      {
        voucherDate: "2026-04-23",
        type: "payment",
        formData: { source: "test" },
        lines: [{ description: "Office rent", amount: 1250 }],
      },
      "approved",
    );

    expect(result.success).toBe(true);
    expect(postVoucherTx).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        orgId: ORG_ID,
        voucherId: "voucher-1",
        actorId: USER_ID,
      }),
    );
  });
});

describe("voucher vendor validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => callback(db));
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
    vi.mocked(validateVoucherVendor).mockResolvedValue(undefined);
  });

  it("saveVoucher rejects cross-org vendorId", async () => {
    vi.mocked(validateVoucherVendor).mockRejectedValue(
      new Error("Vendor not found or does not belong to this organisation.")
    );

    const result = await saveVoucher(
      {
        vendorId: "foreign-vendor",
        voucherDate: "2026-04-23",
        type: "payment",
        formData: {},
        lines: [{ description: "Test", amount: 100 }],
      },
      "draft",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Vendor not found");
    expect(db.voucher.create).not.toHaveBeenCalled();
    expect(validateVoucherVendor).toHaveBeenCalledWith("foreign-vendor", ORG_ID);
  });

  it("saveVoucher allows valid in-org vendorId", async () => {
    vi.mocked(db.voucher.create).mockResolvedValue({
      id: "voucher-1",
      voucherNumber: null,
      totalAmount: 100,
    } as any);

    const result = await saveVoucher(
      {
        vendorId: "vendor-1",
        voucherDate: "2026-04-23",
        type: "payment",
        formData: {},
        lines: [{ description: "Test", amount: 100 }],
      },
      "draft",
    );

    expect(result.success).toBe(true);
    expect(validateVoucherVendor).toHaveBeenCalledWith("vendor-1", ORG_ID);
  });

  it("saveVoucher allows blank vendorId", async () => {
    vi.mocked(db.voucher.create).mockResolvedValue({
      id: "voucher-1",
      voucherNumber: null,
      totalAmount: 100,
    } as any);

    const result = await saveVoucher(
      {
        voucherDate: "2026-04-23",
        type: "payment",
        formData: {},
        lines: [{ description: "Test", amount: 100 }],
      },
      "draft",
    );

    expect(result.success).toBe(true);
    expect(validateVoucherVendor).toHaveBeenCalledWith(undefined, ORG_ID);
  });

  it("updateVoucher rejects cross-org vendorId", async () => {
    vi.mocked(db.voucher.findFirst).mockResolvedValueOnce({
      id: "voucher-1",
      status: "draft",
      accountingStatus: "PENDING",
      totalAmount: 100,
    } as any);
    vi.mocked(validateVoucherVendor).mockRejectedValue(
      new Error("Vendor not found or does not belong to this organisation.")
    );

    const result = await updateVoucher("voucher-1", {
      vendorId: "foreign-vendor",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Vendor not found");
    expect(validateVoucherVendor).toHaveBeenCalledWith("foreign-vendor", ORG_ID);
  });

  it("updateVoucher allows valid in-org vendorId", async () => {
    vi.mocked(db.voucher.findFirst).mockResolvedValueOnce({
      id: "voucher-1",
      status: "draft",
      accountingStatus: "PENDING",
      totalAmount: 100,
    } as any);
    vi.mocked(db.voucher.update).mockResolvedValue({ id: "voucher-1" } as any);

    const result = await updateVoucher("voucher-1", {
      vendorId: "vendor-1",
    });

    expect(result.success).toBe(true);
    expect(validateVoucherVendor).toHaveBeenCalledWith("vendor-1", ORG_ID);
  });

  it("updateVoucher skips vendor validation when vendorId is not provided", async () => {
    vi.mocked(db.voucher.findFirst).mockResolvedValueOnce({
      id: "voucher-1",
      status: "draft",
      accountingStatus: "PENDING",
      totalAmount: 100,
    } as any);
    vi.mocked(db.voucher.update).mockResolvedValue({ id: "voucher-1" } as any);

    const result = await updateVoucher("voucher-1", {
      voucherDate: "2026-04-23",
    });

    expect(result.success).toBe(true);
    expect(validateVoucherVendor).not.toHaveBeenCalled();
  });
});
