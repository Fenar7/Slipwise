import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ClientDetailShell } from "../components/client-detail-shell";

// Mock Next.js Link and navigation
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
  notFound: () => {
    throw new Error("NotFound");
  },
}));

describe("ClientDetailShell", () => {
  it("renders the client detail shell for a known client", () => {
    render(<ClientDetailShell clientId="cl_01" />);
    expect(screen.getByRole("heading", { name: /Acme Manufacturing Ltd/i })).toBeInTheDocument();
    expect(screen.getAllByText(/rajesh@acmemfg.in/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders the summary band with KPIs", () => {
    render(<ClientDetailShell clientId="cl_01" />);
    expect(screen.getByText(/Outstanding/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Invoiced/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Paid/i)).toBeInTheDocument();
    expect(screen.getByText(/Lifetime Value/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Invoices/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Portal Access/i)).toBeInTheDocument();
  });

  it("renders tab navigation with all sections", () => {
    render(<ClientDetailShell clientId="cl_01" />);
    expect(screen.getByRole("navigation", { name: /Client detail sections/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Overview/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Documents/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Contacts/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Billing & Tax/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Portal/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Activity/i })).toBeInTheDocument();
  });

  it("shows overview content by default", () => {
    render(<ClientDetailShell clientId="cl_01" />);
    expect(screen.getByText(/Recent Invoices/i)).toBeInTheDocument();
    expect(screen.getByText(/Recent Quotes/i)).toBeInTheDocument();
    expect(screen.getByText(/Primary Contact/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Address/i })).toBeInTheDocument();
  });

  it("switches to documents tab", () => {
    render(<ClientDetailShell clientId="cl_01" />);
    fireEvent.click(screen.getByRole("button", { name: /Documents/i }));
    expect(screen.getByRole("button", { name: /Documents/i })).toHaveAttribute("aria-current", "page");
  });

  it("switches to contacts tab and shows contacts", () => {
    render(<ClientDetailShell clientId="cl_01" />);
    fireEvent.click(screen.getByRole("button", { name: /Contacts/i }));
    expect(screen.getByText(/All Contacts/i)).toBeInTheDocument();
    expect(screen.getByText(/Rajesh Kumar/i)).toBeInTheDocument();
    expect(screen.getByText(/Sunita Patel/i)).toBeInTheDocument();
  });

  it("switches to billing tab and shows tax info", () => {
    render(<ClientDetailShell clientId="cl_01" />);
    fireEvent.click(screen.getByRole("button", { name: /Billing & Tax/i }));
    expect(screen.getByRole("heading", { name: /Billing Address/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Tax Information/i })).toBeInTheDocument();
    expect(screen.getAllByText(/GSTIN/i).length).toBeGreaterThanOrEqual(1);
  });

  it("switches to portal tab and shows portal status", () => {
    render(<ClientDetailShell clientId="cl_01" />);
    fireEvent.click(screen.getByRole("button", { name: /Portal/i }));
    expect(screen.getByRole("heading", { name: /Client Hub Status/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Portal Actions/i).length).toBeGreaterThanOrEqual(1);
  });

  it("switches to activity tab and shows timeline", () => {
    render(<ClientDetailShell clientId="cl_01" />);
    fireEvent.click(screen.getByRole("button", { name: /Activity/i }));
    expect(screen.getByText(/Recent Activity/i)).toBeInTheDocument();
  });

  it("renders right rail with portal readiness", () => {
    render(<ClientDetailShell clientId="cl_01" />);
    expect(screen.getByRole("heading", { name: /Portal Readiness/i })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: /Quick Actions/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: /Details/i })).toBeInTheDocument();
  });

  it("renders breadcrumbs with back link to clients list", () => {
    render(<ClientDetailShell clientId="cl_01" />);
    expect(screen.getByRole("link", { name: /Clients/i })).toBeInTheDocument();
  });

  it("renders quick action buttons in header", () => {
    render(<ClientDetailShell clientId="cl_01" />);
    const headerActions = screen.getAllByRole("link");
    expect(headerActions.some((el) => el.textContent?.includes("Invoice"))).toBe(true);
    expect(headerActions.some((el) => el.textContent?.includes("Quote"))).toBe(true);
    expect(headerActions.some((el) => el.textContent?.includes("Edit"))).toBe(true);
  });

  it("throws notFound for unknown client id", () => {
    expect(() => render(<ClientDetailShell clientId="unknown-id" />)).toThrow("NotFound");
  });
});

describe("ClientDetailShell — sparse data client", () => {
  it("renders correctly for a client with minimal data", () => {
    render(<ClientDetailShell clientId="cl_02" />);
    expect(screen.getByRole("heading", { name: /Beta Logistics Pvt Ltd/i })).toBeInTheDocument();
    expect(screen.getAllByText(/priya@betalogistics.com/i).length).toBeGreaterThanOrEqual(1);
  });
});
