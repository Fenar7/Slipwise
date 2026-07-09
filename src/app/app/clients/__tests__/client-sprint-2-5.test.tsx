import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import CustomerCrmPage from "../../crm/customers/[id]/page";
import { suiteNavItems } from "../../../../components/layout/suite-nav-items";
import { CustomerForm } from "../../data/components/customer-form";

const mockPush = vi.fn();
const mockBack = vi.fn();
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`Redirected to ${url}`);
});

// Mock Next.js redirection & navigation behavior
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
  redirect: (url: string) => mockRedirect(url),
}));

// Mock tag picker component
vi.mock("@/features/tags/components/tag-picker", () => ({
  TagPicker: () => <div data-testid="mock-tag-picker" />,
}));

const mockCreateCustomer = vi.fn();
const mockUpdateCustomer = vi.fn();

// Mock data actions
vi.mock("../../data/actions", () => ({
  createCustomer: (...args: any[]) => mockCreateCustomer(...args),
  updateCustomer: (...args: any[]) => mockUpdateCustomer(...args),
}));

describe("Sprint 2.5 — Duplicate Customer Surface Consolidation", () => {
  const mockAlert = vi.spyOn(window, "alert").mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    mockAlert.mockClear();
  });

  describe("Legacy CRM Customer Detail Route Redirect", () => {
    it("redirects cleanly to canonical client detail page preserving the client ID", async () => {
      const params = Promise.resolve({ id: "cust-example-abc" });

      await expect(CustomerCrmPage({ params })).rejects.toThrow("Redirected to /app/clients/cust-example-abc");
      expect(mockRedirect).toHaveBeenCalledWith("/app/clients/cust-example-abc");
    });

    it("handles alternative alphanumeric client IDs correctly", async () => {
      const params = Promise.resolve({ id: "client_999_xyz" });

      await expect(CustomerCrmPage({ params })).rejects.toThrow("Redirected to /app/clients/client_999_xyz");
      expect(mockRedirect).toHaveBeenCalledWith("/app/clients/client_999_xyz");
    });
  });

  describe("Suite Navigation Consolidation", () => {
    it("verifies Master Data navigation does not expose duplicate Clients links", () => {
      const masterDataNav = suiteNavItems.find((item) => item.suite === "data");
      expect(masterDataNav).toBeDefined();
      const clientChild = masterDataNav?.children?.find((child) => child.href === "/app/clients");
      expect(clientChild).toBeUndefined();
    });

    it("verifies CRM navigation does not expose duplicate Clients links", () => {
      const crmNav = suiteNavItems.find((item) => item.suite === "crm");
      expect(crmNav).toBeDefined();
      const clientChild = crmNav?.children?.find((child) => child.href === "/app/clients");
      expect(clientChild).toBeUndefined();
    });

    it("verifies top-level Clients suite contains exactly the single canonical Workspace", () => {
      const clientsNav = suiteNavItems.find((item) => item.suite === "clients");
      expect(clientsNav).toBeDefined();
      expect(clientsNav?.children).toHaveLength(1);
      expect(clientsNav?.children?.[0]).toEqual({ href: "/app/clients", label: "Workspace" });
    });

    it("ensures no legacy customer navigation links remain exposed anywhere", () => {
      suiteNavItems.forEach((item) => {
        expect(item.href).not.toContain("/app/data/customers");
        item.children?.forEach((child) => {
          expect(child.href).not.toContain("/app/data/customers");
        });
      });
    });
  });

  describe("Legacy Customer Form Module Consolidation", () => {
    it("redirects to canonical /app/clients on successful submission", async () => {
      mockCreateCustomer.mockResolvedValue({ success: true, data: { id: "new-cust-123" } });

      const { container } = render(<CustomerForm />);

      const nameInput = container.querySelector('input[name="name"]')!;
      fireEvent.change(nameInput, { target: { value: "Consolidated Client Corp" } });

      const submitButton = screen.getByRole("button", { name: /Create Customer/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockCreateCustomer).toHaveBeenCalledWith(expect.objectContaining({
          name: "Consolidated Client Corp",
        }));
        expect(mockPush).toHaveBeenCalledWith("/app/clients");
        expect(mockAlert).not.toHaveBeenCalled();
      });
    });

    it("handles submission errors in inline UI state and does not call alert()", async () => {
      mockCreateCustomer.mockResolvedValue({ success: false, error: "Validation error: GSTIN format is invalid" });

      const { container } = render(<CustomerForm />);

      const nameInput = container.querySelector('input[name="name"]')!;
      fireEvent.change(nameInput, { target: { value: "Invalid Client Corp" } });

      const submitButton = screen.getByRole("button", { name: /Create Customer/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockCreateCustomer).toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled();
        expect(mockAlert).not.toHaveBeenCalled();
        expect(screen.getByText("Validation error: GSTIN format is invalid")).toBeInTheDocument();
      });
    });
  });
});
