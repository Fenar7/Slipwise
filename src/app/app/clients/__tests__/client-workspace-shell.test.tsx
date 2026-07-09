import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClientWorkspaceShell } from "../components/client-workspace-shell";
import { ClientWorkspaceTable } from "../components/client-workspace-table";
import { ClientWorkspaceEmpty } from "../components/client-workspace-empty";
import { MOCK_CLIENTS } from "../components/client-workspace-mock-data";

// Mock Next.js Link
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

// Mock next/navigation for header
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));

describe("ClientWorkspaceShell", () => {
  it("renders the workspace shell with real data props", () => {
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
    expect(screen.getByRole("heading", { name: /Clients/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search clients/i)).toBeInTheDocument();
    expect(screen.getByText(/Acme Manufacturing Ltd/i)).toBeInTheDocument();
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
  });

  it("renders filtered no-match state when org has customers but filter matches none", () => {
    render(
      <ClientWorkspaceShell
        clients={[]}
        total={0}
        page={1}
        totalPages={1}
        unfilteredTotal={10}
        searchQuery="zzzzzzzzz"
        activeFilter="all"
      />
    );
    expect(screen.queryByText(/No clients yet/i)).not.toBeInTheDocument();
    expect(screen.getByText(/No clients match your search/i)).toBeInTheDocument();
  });
});

describe("ClientWorkspaceTable", () => {
  it("renders rows and pagination", () => {
    render(
      <ClientWorkspaceTable
        clients={MOCK_CLIENTS}
        total={MOCK_CLIENTS.length}
        page={1}
        totalPages={2}
        searchQuery=""
        activeFilter="all"
      />
    );
    expect(screen.getByText(/Acme Manufacturing Ltd/i)).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 2/i)).toBeInTheDocument();
  });

  it("shows empty state when no matches", () => {
    render(
      <ClientWorkspaceTable
        clients={[]}
        total={0}
        page={1}
        totalPages={1}
        searchQuery="zzzzzzzzz"
        activeFilter="all"
      />
    );
    expect(screen.getByText(/No clients match your filters/i)).toBeInTheDocument();
  });
});

describe("ClientWorkspaceEmpty", () => {
  it("renders empty state with actions", () => {
    render(<ClientWorkspaceEmpty />);
    expect(screen.getByText(/No clients yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Add Client/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Import/i })).toBeInTheDocument();
  });
});
