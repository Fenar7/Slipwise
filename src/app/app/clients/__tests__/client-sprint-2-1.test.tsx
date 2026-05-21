import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClientWorkspaceShell } from "../components/client-workspace-shell";
import { ClientWorkspaceRowView } from "../components/client-workspace-row";
import { ClientWorkspaceTable } from "../components/client-workspace-table";
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
        unfilteredTotal={1}
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
        unfilteredTotal={1}
        searchQuery=""
        activeFilter="all"
      />
    );

    expect(screen.getByText(/Minimal Customer/i)).toBeInTheDocument();
    expect(screen.getAllByText(/—/).length).toBeGreaterThanOrEqual(2);
  });

  it("renders true empty state when org has no customers at all", () => {
    render(
      <ClientWorkspaceShell
        clients={[]}
        total={0}
        page={1}
        totalPages={1}
        unfilteredTotal={0}
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

  it("renders filtered no-match state when org has customers but query matches none", () => {
    render(
      <ClientWorkspaceShell
        clients={[]}
        total={0}
        page={1}
        totalPages={1}
        unfilteredTotal={10}
        searchQuery="nonexistent"
        activeFilter="all"
      />
    );
    expect(screen.queryByText(/No clients yet/i)).not.toBeInTheDocument();
    expect(screen.getByText(/No clients match your search/i)).toBeInTheDocument();
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

  it("does not treat revoked portal tokens as enabled", () => {
    const { unmount } = render(
      <ClientWorkspaceRowView
        client={{
          ...MOCK_CLIENTS[0],
          id: "cust_revoked",
          email: "test@example.com",
          portalStatus: "invited",
        }}
      />
    );
    expect(screen.queryByText("Hub Active")).not.toBeInTheDocument();
    expect(screen.getByText("Invite Sent")).toBeInTheDocument();
    unmount();
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
        unfilteredTotal={100}
        searchQuery=""
        activeFilter="all"
      />
    );
    expect(screen.getByText(/5 \/ 10/i)).toBeInTheDocument();
  });

  it("search placeholder accurately reflects backend search fields", () => {
    render(
      <ClientWorkspaceShell
        clients={MOCK_CLIENTS}
        total={MOCK_CLIENTS.length}
        page={1}
        totalPages={1}
        unfilteredTotal={MOCK_CLIENTS.length}
        searchQuery=""
        activeFilter="all"
      />
    );
    expect(screen.getByPlaceholderText(/Search clients by name, email, or phone/i)).toBeInTheDocument();
  });

  it("reflects enabled portal status when an older valid token exists despite a revoked newest token", () => {
    const { unmount } = render(
      <ClientWorkspaceRowView
        client={{
          ...MOCK_CLIENTS[0],
          id: "cust_multi_token",
          email: "test@example.com",
          portalStatus: "enabled",
        }}
      />
    );
    expect(screen.getByText("Hub Active")).toBeInTheDocument();
    expect(screen.queryByText("Invite Sent")).not.toBeInTheDocument();
    unmount();
  });

  it("does not show an Import action in the workspace header", () => {
    render(
      <ClientWorkspaceShell
        clients={MOCK_CLIENTS}
        total={MOCK_CLIENTS.length}
        page={1}
        totalPages={1}
        unfilteredTotal={MOCK_CLIENTS.length}
        searchQuery=""
        activeFilter="all"
      />
    );
    expect(screen.queryByRole("link", { name: /Import/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Import")).not.toBeInTheDocument();
  });

  it("renders last activity column header with active sort state", () => {
    const { container } = render(
      <ClientWorkspaceTable
        clients={MOCK_CLIENTS}
        total={MOCK_CLIENTS.length}
        page={1}
        totalPages={1}
        searchQuery=""
        activeFilter="all"
        sort={{ key: "lastActivityAt", dir: "desc" }}
      />
    );
    const lastActivityHeader = screen.getByRole("link", { name: /Last Activity/i });
    expect(lastActivityHeader).toBeInTheDocument();
    expect(lastActivityHeader.getAttribute("href")).toContain("sort=lastActivityAt");
  });
});
