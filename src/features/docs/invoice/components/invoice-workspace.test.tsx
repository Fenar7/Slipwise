import { fireEvent, render, screen } from "@testing-library/react";
import InvoicePage from "@/app/invoice/page";
import { vi } from "vitest";

describe("Invoice workspace", () => {
  beforeAll(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });
  it("renders the interactive invoice builder", () => {
    render(<InvoicePage />);

    expect(
      screen.getByRole("heading", { name: "Template and branding", level: 3 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /professional/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Preview/i).length).toBeGreaterThan(0);
  });

  it("updates the preview when line items change", () => {
    render(<InvoicePage />);

    fireEvent.change(screen.getByLabelText(/amount paid/i), {
      target: { value: "20000" },
    });

    expect(screen.getByText(/₹34,100.00/i)).toBeInTheDocument();
  });

  it("hides notes when the notes visibility toggle is disabled", () => {
    render(<InvoicePage />);

    expect(
      screen.getByText(/thank you for the continued engagement/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("switch", {
        name: /notes/i,
      }),
    );

    expect(
      screen.queryByText(/thank you for the continued engagement/i),
    ).not.toBeInTheDocument();
  });

  it("hides the payment summary block when the visibility toggle is disabled", () => {
    render(<InvoicePage />);

    expect(screen.getAllByText(/₹39,100.00/i).length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getByRole("switch", {
        name: /payment summary/i,
      }),
    );

    expect(screen.queryByText(/₹39,100.00/i)).not.toBeInTheDocument();
  });
});
