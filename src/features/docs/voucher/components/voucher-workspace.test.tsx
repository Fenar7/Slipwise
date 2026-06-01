import { fireEvent, render, screen } from "@testing-library/react";
import VoucherPage from "@/app/voucher/page";
import { VoucherWorkspace } from "./voucher-workspace";

vi.mock("@/app/app/docs/vouchers/autofill-resolver", () => ({
  resolveVoucherAutofill: vi.fn(),
}));

describe("Voucher workspace", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the interactive voucher builder", () => {
    render(<VoucherPage />);

    expect(
      screen.getByRole("button", { name: /traditional ledger/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /voucher type/i }),
    ).toBeInTheDocument();
  });

  it("updates the preview when the voucher type changes", () => {
    render(<VoucherPage />);

    fireEvent.change(screen.getByLabelText(/voucher type/i), {
      target: { value: "receipt" },
    });

    expect(screen.getByText("Receipt Voucher")).toBeInTheDocument();
    expect(screen.getByLabelText(/received from/i)).toBeInTheDocument();
  });

  it("hides notes from the preview when the visibility toggle is disabled", () => {
    render(<VoucherPage />);

    const notesSwitch = screen.getByRole("switch", {
      name: /notes/i,
    });
    expect(notesSwitch).toBeInTheDocument();

    fireEvent.click(notesSwitch);
  });

  // Export validation test requires integration setup outside Sprint 4.3 scope

  describe("Sprint 4.4 — shared defaulting: template precedence", () => {
    const testVendors = [
      { id: "vendor-1", name: "Test Vendor", email: null, phone: null, address: null, gstin: null },
    ];

    it("seeds form templateId from initialTemplateId when creating a new voucher", () => {
      render(<VoucherWorkspace initialTemplateId="traditional-ledger" />);

      expect(screen.getByRole("button", { name: /traditional ledger/i }))
        .toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: /minimal office/i }))
        .toHaveAttribute("aria-pressed", "false");
    });

    it("does not let vendor rehydration overwrite the initial templateId", async () => {
      const { resolveVoucherAutofill } = await import("@/app/app/docs/vouchers/autofill-resolver");
      vi.mocked(resolveVoucherAutofill).mockResolvedValue({
        vendorId: "vendor-1",
        voucherType: "payment",
        date: "2026-06-01",
        counterpartyName: "Test Vendor",
        notes: "Vendor-specific notes",
        approvedBy: "",
        receivedBy: "",
        paymentMode: "Bank Transfer",
        referenceNumber: "",
        purpose: "",
        branding: { companyName: "Org", address: "", email: "", phone: "", accentColor: "#dc2626" },
        templateId: "minimal-office",
        metadata: { resolvedAt: new Date().toISOString() },
      });

      render(<VoucherWorkspace initialTemplateId="traditional-ledger" vendors={testVendors} />);

      expect(screen.getByRole("button", { name: /traditional ledger/i }))
        .toHaveAttribute("aria-pressed", "true");

      const vendorButton = screen.getByRole("button", { name: /select vendor/i });
      fireEvent.click(vendorButton);

      const vendorOption = screen.getByText("Test Vendor");
      fireEvent.click(vendorOption);

      expect(screen.getByRole("button", { name: /traditional ledger/i }))
        .toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: /minimal office/i }))
        .toHaveAttribute("aria-pressed", "false");
    });

    it("preserves operator-chosen template even after vendor switch rehydration", async () => {
      const { resolveVoucherAutofill } = await import("@/app/app/docs/vouchers/autofill-resolver");
      vi.mocked(resolveVoucherAutofill).mockResolvedValue({
        vendorId: "vendor-1",
        voucherType: "receipt",
        date: "2026-06-01",
        counterpartyName: "Test Vendor",
        notes: "Switched vendor notes",
        approvedBy: "",
        receivedBy: "",
        paymentMode: "UPI",
        referenceNumber: "",
        purpose: "",
        branding: { companyName: "Org", address: "", email: "", phone: "", accentColor: "#0ea5e9" },
        templateId: "traditional-ledger",
        metadata: { resolvedAt: new Date().toISOString() },
      });

      render(<VoucherWorkspace initialTemplateId="minimal-office" vendors={testVendors} />);

      const minimalBtn = screen.getByRole("button", { name: /minimal office/i });
      const traditionalBtn = screen.getByRole("button", { name: /traditional ledger/i });

      expect(minimalBtn).toHaveAttribute("aria-pressed", "true");

      fireEvent.click(traditionalBtn);
      expect(traditionalBtn).toHaveAttribute("aria-pressed", "true");
      expect(minimalBtn).toHaveAttribute("aria-pressed", "false");

      const vendorButton = screen.getByRole("button", { name: /select vendor/i });
      fireEvent.click(vendorButton);
      const vendorOption = screen.getByText("Test Vendor");
      fireEvent.click(vendorOption);

      expect(traditionalBtn).toHaveAttribute("aria-pressed", "true");
      expect(minimalBtn).toHaveAttribute("aria-pressed", "false");
    });
  });
});
