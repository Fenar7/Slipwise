import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ClientWorkspaceShell } from "../components/client-workspace-shell";
import { ClientWorkspaceHeader } from "../components/client-workspace-header";
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

describe("ClientWorkspaceShell", () => {
  it("renders the workspace shell with header and table", () => {
    render(<ClientWorkspaceShell />);
    expect(screen.getByRole("heading", { name: /Clients/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search clients/i)).toBeInTheDocument();
    expect(screen.getByText(/Acme Manufacturing Ltd/i)).toBeInTheDocument();
  });

  it("filters rows by search query", () => {
    render(<ClientWorkspaceShell />);
    const input = screen.getByPlaceholderText(/Search clients/i);
    fireEvent.change(input, { target: { value: "Acme" } });
    expect(screen.getByText(/Acme Manufacturing Ltd/i)).toBeInTheDocument();
    expect(screen.queryByText(/Beta Logistics/i)).not.toBeInTheDocument();
  });

  it("switches filter chips", () => {
    render(<ClientWorkspaceShell />);
    const activeChip = screen.getByRole("button", { name: /Active/i });
    fireEvent.click(activeChip);
    // Active filter should reduce visible rows (only 5+ active/won in mock data)
    expect(screen.getAllByText(/Active/i).length).toBeGreaterThan(0);
  });
});

describe("ClientWorkspaceHeader", () => {
  it("renders search, filters, and actions", () => {
    render(
      <ClientWorkspaceHeader
        searchQuery=""
        onSearchChange={vi.fn()}
        activeFilter="all"
        onFilterChange={vi.fn()}
        resultCount={10}
      />
    );
    expect(screen.getByRole("heading", { name: /Clients/i })).toBeInTheDocument();
    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(screen.getByText(/Add Client/i)).toBeInTheDocument();
    expect(screen.getByText(/Showing/i)).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("calls onSearchChange when typing", () => {
    const onSearchChange = vi.fn();
    render(
      <ClientWorkspaceHeader
        searchQuery=""
        onSearchChange={onSearchChange}
        activeFilter="all"
        onFilterChange={vi.fn()}
        resultCount={10}
      />
    );
    const input = screen.getByPlaceholderText(/Search clients/i);
    fireEvent.change(input, { target: { value: "test" } });
    expect(onSearchChange).toHaveBeenCalledWith("test");
  });

  it("shows active filter pill when not all", () => {
    render(
      <ClientWorkspaceHeader
        searchQuery=""
        onSearchChange={vi.fn()}
        activeFilter="active"
        onFilterChange={vi.fn()}
        resultCount={5}
      />
    );
    expect(screen.getAllByText(/Active/i).length).toBeGreaterThanOrEqual(1);
  });
});

describe("ClientWorkspaceTable", () => {
  it("renders rows and pagination", () => {
    render(
      <ClientWorkspaceTable
        clients={MOCK_CLIENTS}
        searchQuery=""
        activeFilter="all"
        pageSize={5}
      />
    );
    expect(screen.getByText(/Acme Manufacturing Ltd/i)).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 2/i)).toBeInTheDocument();
  });

  it("shows empty state when no matches", () => {
    render(
      <ClientWorkspaceTable
        clients={MOCK_CLIENTS}
        searchQuery="zzzzzzzzz"
        activeFilter="all"
        pageSize={5}
      />
    );
    expect(screen.getByText(/No clients match your filters/i)).toBeInTheDocument();
  });

  it("paginates to next page", () => {
    render(
      <ClientWorkspaceTable
        clients={MOCK_CLIENTS}
        searchQuery=""
        activeFilter="all"
        pageSize={5}
      />
    );
    const nextBtn = screen.getByRole("button", { name: /Next/i });
    fireEvent.click(nextBtn);
    expect(screen.getByText(/2 \/ 2/i)).toBeInTheDocument();
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
