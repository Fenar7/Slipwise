import { fireEvent, render, screen, act } from "@testing-library/react";
import VoucherPage from "@/app/voucher/page";
import { WorkspaceTopBarProvider, useWorkspaceTopBar } from "@/components/layout/workspace-topbar-context";

function VoucherActionsRenderer() {
  const { actions } = useWorkspaceTopBar();
  return (
    <div>
      {actions.map((action) => (
        <button
          key={action.id}
          onClick={action.onClick}
          disabled={action.disabled}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

const renderVoucherPage = () => {
  return render(
    <WorkspaceTopBarProvider>
      <div>
        <h1 className="text-lg font-bold">Voucher Generator</h1>
        <VoucherActionsRenderer />
        <VoucherPage />
      </div>
    </WorkspaceTopBarProvider>
  );
};

describe("Voucher workspace", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the interactive voucher builder", () => {
    renderVoucherPage();

    expect(
      screen.getByRole("heading", { name: "Voucher Generator", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /traditional ledger/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/payment voucher/i).length).toBeGreaterThan(0);
  });

  it("updates the preview when the voucher type changes", () => {
    renderVoucherPage();

    fireEvent.change(screen.getByLabelText(/voucher type/i), {
      target: { value: "receipt" },
    });

    expect(screen.getByText("Receipt Voucher")).toBeInTheDocument();
    expect(screen.getByLabelText(/received from/i)).toBeInTheDocument();
  });

  it("hides notes from the preview when the visibility toggle is disabled", () => {
    renderVoucherPage();

    expect(
      screen.getByText("Settled after manager approval."),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("switch", {
        name: /notes/i,
      }),
    );

    expect(
      screen.queryByText("Settled after manager approval."),
    ).not.toBeInTheDocument();
  });

  it("shows an error state when export validation fails", async () => {
    renderVoucherPage();

    // Switch to Document view so inline edit fields are visible in jsdom
    // (preview is hidden by default on non-desktop viewports).
    const documentViewButtons = screen.getAllByRole("button", { name: /document/i });
    fireEvent.click(documentViewButtons[documentViewButtons.length - 1]);

    // Counterparty field has placeholder "Rahul Menon" and is the first such input
    // in the default payment voucher layout.
    // Use findAllByPlaceholderText to wait for the view-mode transition to complete.
    const nameInputs = await screen.findAllByPlaceholderText("Rahul Menon");
    fireEvent.change(nameInputs[0], {
      target: { value: "" },
    });

    fireEvent.click(screen.getAllByRole("button", { name: /export pdf/i })[0]);

    expect(
      await screen.findByText(/complete the required voucher fields before exporting/i),
    ).toBeInTheDocument();
  });
});
