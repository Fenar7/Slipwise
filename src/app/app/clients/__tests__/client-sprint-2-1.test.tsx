import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClientWorkspaceShell } from "../components/client-workspace-shell";
import { ClientWorkspaceRowView } from "../components/client-workspace-row";
import { MOCK_CLIENTS } from "../components/client-workspace-mock-data";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));

describe("Sprint 2.1 — Canonical client list workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders workspace with real customer data shape", () => {
    const realData = [
      {
        id: "cust_01",
        name: "Real Customer Pvt Ltd",
        contactName: "John Doe",
        email: "john@realcustomer.com",
        phone: "+91 98765 43210",
        portalStatus: "enabled" as const,
        lifecycleStage: "ACTIVE" as const,
        outstandingBalance: 125000,
        invoiceCount: 8,
        quoteCount: 2,
        lastActivityAt: new Date("2026-05-18T10:00:00Z"),
      },
    ];

    render(
      <ClientWorkspaceShell
        clients={realData}
        total={1}
        page={1}
        totalPages={1}
        searchQuery=""
        activeFilter="all"
      />
    );

    expect(screen.getByText(/Real Customer Pvt Ltd/i)).toBeInTheDocument();
    expect(screen.getByText(/john@realcustomer.com/i)).toBeInTheDocument();
    expect(screen.getByText(/₹1,25,000/i)).toBeInTheDocument();
    expect(screen.getByTitle("Invoices")).toHaveTextContent("8");
  });

  it("handles partial records with missing optional fields", () => {
    const partialData = [
      {
        id: "cust_02",
        name: "Minimal Customer",
        email: null,
        phone: null,
        portalStatus: "ineligible" as const,
        lifecycleStage: "PROSPECT" as const,
        outstandingBalance: 0,
        invoiceCount: 0,
        quoteCount: 0,
        lastActivityAt: new Date("2026-05-01T00:00:00Z"),
      },
    ];

    render(
      <ClientWorkspaceShell
        clients={partialData}
        total={1}
        page={1}
        totalPages={1}
        searchQuery=""
        activeFilter="all"
      />
    );

    expect(screen.getByText(/Minimal Customer/i)).toBeInTheDocument();
    expect(screen.getAllByText(/—/).length).toBeGreaterThanOrEqual(2);
  });

  it("renders empty state when total is 0", () => {
    render(
      <ClientWorkspaceShell
        clients={[]}
        total={0}
        page={1}
        totalPages={1}
        searchQuery=""
        activeFilter="all"
      />
    );
    expect(screen.getByText(/No clients yet/i)).toBeInTheDocument();
    const addLinks = screen.getAllByRole("link", { name: /Add Client/i });
    expect(addLinks[addLinks.length - 1]).toHaveAttribute(
      "href",
      "/app/data/customers/new"
    );
  });

  it("renders empty state when no clients exist and query is present", () => {
    render(
      <ClientWorkspaceShell
        clients={[]}
        total={0}
        page={1}
        totalPages={1}
        searchQuery="nonexistent"
        activeFilter="all"
      />
    );
    expect(screen.getByText(/No clients yet/i)).toBeInTheDocument();
  });

  it("shows portal status badges correctly", () => {
    const statuses = [
      { status: "enabled" as const, label: "Hub Active" },
      { status: "invited" as const, label: "Invite Sent" },
      { status: "ineligible" as const, label: "No Email" },
    ];

    for (const { status, label } of statuses) {
      const { unmount } = render(
        <ClientWorkspaceRowView
          client={{
            ...MOCK_CLIENTS[0],
            id: `cust_${status}`,
            portalStatus: status,
          }}
        />
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it("renders quick action links with valid hrefs", () => {
    render(<ClientWorkspaceRowView client={MOCK_CLIENTS[0]} />);

    const invoiceLink = screen.getByRole("link", { name: /Invoice/i });
    expect(invoiceLink).toHaveAttribute(
      "href",
      `/app/docs/invoices/new?customerId=${MOCK_CLIENTS[0].id}`
    );

    const quoteLink = screen.getByRole("link", { name: /Quote/i });
    expect(quoteLink).toHaveAttribute(
      "href",
      `/app/docs/quotes/new?customerId=${MOCK_CLIENTS[0].id}`
    );

    const editLink = screen.getByRole("link", { name: /Edit/i });
    expect(editLink).toHaveAttribute(
      "href",
      `/app/data/customers/${MOCK_CLIENTS[0].id}`
    );
  });

  it("handles large pagination numbers", () => {
    render(
      <ClientWorkspaceShell
        clients={MOCK_CLIENTS.slice(0, 2)}
        total={100}
        page={5}
        totalPages={10}
        searchQuery=""
        activeFilter="all"
      />
    );
    expect(screen.getByText(/5 \/ 10/i)).toBeInTheDocument();
  });
});
