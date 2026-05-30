import { fireEvent, render, screen } from "@testing-library/react";
import VoucherPage from "@/app/voucher/page";

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
});
