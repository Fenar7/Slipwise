/**
 * Phase 1 Sprint 1.4 — Admin Customization Shell Render Tests
 *
 * Covers: customization shell renders with all major sections,
 * preview pane renders for each page type, static-only markers present,
 * tab switching works, reset behavior is inert (no real persistence).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ClientHubCustomizationPage from "../page";

const mockUseActiveOrg = vi.hoisted(() => vi.fn(() => ({ activeOrg: { id: "org_001", name: "Acme", slug: "acme" } })));
const mockUsePermissions = vi.hoisted(() => vi.fn(() => ({ role: "admin" })));

vi.mock("@/hooks/use-active-org", () => ({ useActiveOrg: mockUseActiveOrg }));
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: mockUsePermissions }));
vi.mock("next/navigation", () => ({ usePathname: () => "/app/settings/portal/client-hub" }));

describe("ClientHubCustomizationPage", () => {
  it("renders the customization shell with header and tabs", () => {
    render(<ClientHubCustomizationPage />);

    expect(screen.getByText("Client Hub Customization")).toBeInTheDocument();
    expect(screen.getByText(/customize branding, content, and experience/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /branding/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /home \/ dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /invoices/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /quotes/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /payments/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /about/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /contact/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /products \/ services/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /navigation \/ footer/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /preview/i })).toBeInTheDocument();
  });

  it("shows static-only notice and disabled publish action", () => {
    render(<ClientHubCustomizationPage />);

    expect(screen.getByText(/phase 1 — preview only/i)).toBeInTheDocument();
    expect(screen.getByText(/customizations are local to this session/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /publish/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /save draft/i })).toBeDisabled();
  });

  it("switches tabs and renders corresponding section content", () => {
    render(<ClientHubCustomizationPage />);

    // Default: Branding tab
    expect(screen.getByText("Brand Colors")).toBeInTheDocument();

    // Switch to Home/Dashboard
    fireEvent.click(screen.getByRole("tab", { name: "Home / Dashboard" }));
    expect(screen.getByText("Hero Messaging")).toBeInTheDocument();
    expect(screen.getByText("Dashboard Cards")).toBeInTheDocument();

    // Switch to Invoices
    fireEvent.click(screen.getByRole("tab", { name: "Invoices" }));
    expect(screen.getByLabelText("Page Title")).toBeInTheDocument();
    expect(screen.getByText("Show download button")).toBeInTheDocument();

    // Switch to Quotes
    fireEvent.click(screen.getByRole("tab", { name: "Quotes" }));
    expect(screen.getByText(/enable accept \/ decline/i)).toBeInTheDocument();

    // Switch to Payments
    fireEvent.click(screen.getByRole("tab", { name: "Payments" }));
    expect(screen.getByText("Show payment methods list")).toBeInTheDocument();

    // Switch to About
    fireEvent.click(screen.getByRole("tab", { name: "About" }));
    expect(screen.getByLabelText("Body")).toBeInTheDocument();

    // Switch to Contact
    fireEvent.click(screen.getByRole("tab", { name: "Contact" }));
    expect(screen.getByLabelText("Support Email")).toBeInTheDocument();

    // Switch to Products
    fireEvent.click(screen.getByRole("tab", { name: "Products / Services" }));
    expect(screen.getByText("Show pricing")).toBeInTheDocument();

    // Switch to Navigation
    fireEvent.click(screen.getByRole("tab", { name: "Navigation / Footer" }));
    expect(screen.getByLabelText("Footer Text")).toBeInTheDocument();
  });

  it("renders preview pane with preview-only marker", () => {
    render(<ClientHubCustomizationPage />);

    expect(screen.getByText("Live Preview")).toBeInTheDocument();
    expect(screen.getAllByText("Preview only").length).toBeGreaterThanOrEqual(1);
  });

  it("switches preview pages without leaving preview mode", () => {
    render(<ClientHubCustomizationPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.getByText("Preview Controls")).toBeInTheDocument();
    expect(screen.getAllByText("Your business hub, beautifully organized").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: "Contact" }));
    expect(screen.getByText("Preview Controls")).toBeInTheDocument();
    expect(screen.getAllByText("Get in touch with the team behind your account").length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty-org message when no active org", () => {
    mockUseActiveOrg.mockReturnValueOnce({ activeOrg: null });
    render(<ClientHubCustomizationPage />);
    expect(screen.getByText(/no active organization/i)).toBeInTheDocument();
  });

  it("denies access for non-admin users", () => {
    mockUsePermissions.mockReturnValueOnce({ role: "member" });
    render(<ClientHubCustomizationPage />);
    expect(screen.getByText(/you need admin or owner access/i)).toBeInTheDocument();
  });
});
