import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { createCustomer, updateCustomer } from "../../data/actions";
import { ClientDetailRail } from "../components/client-detail-rail";
import { ClientWorkspaceRowView } from "../components/client-workspace-row";
import { ClientForm } from "../components/client-form";

// Mock Next.js Link and navigation
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  notFound: () => {
    throw new Error("NotFound");
  },
}));

vi.mock("@/features/tags/components/tag-picker", () => ({
  TagPicker: ({ selectedIds, onChange }: any) => (
    <div data-testid="tag-picker" data-selected-ids={JSON.stringify(selectedIds)}>
      <button onClick={() => onChange([...selectedIds, "new-tag-id"])}>Add Tag</button>
    </div>
  ),
}));

const mocks = vi.hoisted(() => ({
  requireOrgContext: vi.fn(),
  customerCreate: vi.fn(),
  customerUpdate: vi.fn(),
  customerFindFirst: vi.fn(),
  setCustomerDefaultTags: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: mocks.requireOrgContext,
}));

vi.mock("@/lib/db", () => ({
  db: {
    customer: {
      create: mocks.customerCreate,
      update: mocks.customerUpdate,
      findFirst: mocks.customerFindFirst,
    },
  },
}));

vi.mock("@/lib/tags/assignment-service", () => ({
  setCustomerDefaultTags: mocks.setCustomerDefaultTags,
  setVendorDefaultTags: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

describe("Sprint 2.3 — Server-Side Validation, Normalization and Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrgContext.mockResolvedValue({ orgId: "org-123" });
  });

  describe("createCustomer validations", () => {
    it("fails when name is missing or only whitespace", async () => {
      const result1 = await createCustomer({ name: "" });
      expect(result1.success).toBe(false);
      expect((result1 as any).error).toBe("Name is required");

      const result2 = await createCustomer({ name: "   " });
      expect(result2.success).toBe(false);
      expect((result2 as any).error).toBe("Name is required");
      expect(mocks.customerCreate).not.toHaveBeenCalled();
    });

    it("fails when email format is invalid", async () => {
      const result = await createCustomer({ name: "Acme", email: "invalid-email" });
      expect(result.success).toBe(false);
      expect((result as any).error).toBe("Invalid email format");
      expect(mocks.customerCreate).not.toHaveBeenCalled();
    });

    it("fails when phone is invalid", async () => {
      const result = await createCustomer({ name: "Acme", phone: "123" }); // too short
      expect(result.success).toBe(false);
      expect((result as any).error).toBe("Phone number must be between 7 and 15 digits");
      expect(mocks.customerCreate).not.toHaveBeenCalled();
    });

    it("fails when GSTIN format is invalid", async () => {
      const result = await createCustomer({ name: "Acme", gstin: "12345" }); // too short
      expect(result.success).toBe(false);
      expect((result as any).error).toBe("GSTIN must be exactly 15 characters");
      expect(mocks.customerCreate).not.toHaveBeenCalled();
    });

    it("normalizes and successfully creates customer", async () => {
      mocks.customerCreate.mockResolvedValue({ id: "cust-created-123" });

      const result = await createCustomer({
        name: "  Acme Corp  ",
        email: "  billing@acme.com  ",
        phone: "  +91-9876543210  ",
        address: "  123 Acme St  ",
        taxId: "  PAN1234567  ",
        gstin: "  29abcde1234f1z5  ",
        tagIds: ["tag-1", "tag-2"],
      });

      expect(result.success).toBe(true);
      expect((result as any).data.id).toBe("cust-created-123");

      expect(mocks.customerCreate).toHaveBeenCalledWith({
        data: {
          name: "Acme Corp",
          email: "billing@acme.com",
          phone: "+91-9876543210",
          address: "123 Acme St",
          taxId: "PAN1234567",
          gstin: "29ABCDE1234F1Z5", // converted to uppercase
          organizationId: "org-123",
        },
      });

      expect(mocks.setCustomerDefaultTags).toHaveBeenCalledWith("cust-created-123", ["tag-1", "tag-2"]);
    });

    it("normalizes empty optional strings to null", async () => {
      mocks.customerCreate.mockResolvedValue({ id: "cust-created-456" });

      const result = await createCustomer({
        name: "Only Name",
        email: "   ",
        phone: "   ",
        address: "   ",
        taxId: "   ",
        gstin: "   ",
      });

      expect(result.success).toBe(true);
      expect(mocks.customerCreate).toHaveBeenCalledWith({
        data: {
          name: "Only Name",
          email: null,
          phone: null,
          address: null,
          taxId: null,
          gstin: null,
          organizationId: "org-123",
        },
      });
    });
  });

  describe("updateCustomer validations and security", () => {
    it("fails if client does not belong to the user's organization", async () => {
      mocks.customerFindFirst.mockResolvedValue(null); // not found in org-123

      const result = await updateCustomer("cust-999", { name: "New Name" });
      expect(result.success).toBe(false);
      expect((result as any).error).toBe("Customer not found");
      expect(mocks.customerUpdate).not.toHaveBeenCalled();
    });

    it("fails when name is updated to empty string", async () => {
      mocks.customerFindFirst.mockResolvedValue({ id: "cust-789", organizationId: "org-123" });

      const result = await updateCustomer("cust-789", { name: "   " });
      expect(result.success).toBe(false);
      expect((result as any).error).toBe("Name is required");
      expect(mocks.customerUpdate).not.toHaveBeenCalled();
    });

    it("normalizes and updates successfully", async () => {
      mocks.customerFindFirst.mockResolvedValue({ id: "cust-789", organizationId: "org-123" });
      mocks.customerUpdate.mockResolvedValue({ id: "cust-789" });

      const result = await updateCustomer("cust-789", {
        name: "  Acme Updated  ",
        email: "  ", // normalizes to null
        gstin: "  29abcde1234f1z6  ", // uppercase normalization
        tagIds: ["tag-3"],
      });

      expect(result.success).toBe(true);
      expect(mocks.customerUpdate).toHaveBeenCalledWith({
        where: { id: "cust-789" },
        data: {
          name: "Acme Updated",
          email: null,
          gstin: "29ABCDE1234F1Z6",
        },
      });

      expect(mocks.setCustomerDefaultTags).toHaveBeenCalledWith("cust-789", ["tag-3"]);
    });
  });

  describe("Sprint 2.3 — Component Routing and Tag Hydration", () => {
    it("ClientDetailRail Edit button links directly to the canonical edit route", () => {
      const client = {
        id: "cust-abc",
        name: "Acme Corp",
        email: "billing@acme.com",
        phone: "+91-9876543210",
        city: "Bangalore",
        state: "Karnataka",
        address: "123 Street",
        portalStatus: "disabled" as const,
        lifecycleStage: "ACTIVE" as const,
        outstandingBalance: 100,
        invoiceCount: 2,
        quoteCount: 1,
        lastActivityAt: "2026-05-21T07:00:00Z",
        gstin: "29ABCDE1234F1Z5",
        panNumber: "ABCDE1234F",
        postalCode: "560001",
        country: "India",
        billingAddress: "123 Street",
        taxId: "ABCDE1234F",
        preferredLanguage: "en",
        tags: ["VIP"],
        assignedTo: "John",
        createdAt: "2026-05-21T00:00:00Z",
        notes: "CRM notes",
        contacts: [],
        totalInvoiced: 200,
        totalPaid: 100,
        lifetimeValue: 200,
        portalEnabled: false,
        portalAccessCount: 0,
        recentInvoices: [],
        recentQuotes: [],
        recentActivity: [],
      };

      render(<ClientDetailRail client={client} />);
      const editLink = screen.getByRole("link", { name: /Edit Client/i });
      expect(editLink.getAttribute("href")).toBe("/app/clients/cust-abc/edit");
    });

    it("ClientWorkspaceRowView Edit action links directly to the canonical edit route", () => {
      const client = {
        id: "cust-def",
        name: "Beta Corp",
        email: "beta@corp.com",
        phone: null,
        address: null,
        taxId: null,
        gstin: null,
        portalStatus: "ineligible" as const,
        lifecycleStage: "PROSPECT" as const,
        outstandingBalance: 0,
        invoiceCount: 0,
        quoteCount: 0,
        lastActivityAt: "2026-05-21T07:00:00Z",
        createdAt: "2026-05-21T00:00:00Z",
        tags: [],
      };

      render(
        <table>
          <tbody>
            <ClientWorkspaceRowView client={client} />
          </tbody>
        </table>
      );
      const editLink = screen.getByRole("link", { name: /Edit/i });
      expect(editLink.getAttribute("href")).toBe("/app/clients/cust-def/edit");
    });

    it("ClientForm hydrates existing default tags correctly", () => {
      const client = {
        id: "cust-tag-test",
        name: "Taggy Corp",
        email: "tag@test.com",
        phone: null,
        address: null,
        taxId: null,
        gstin: null,
        defaultTagAssignments: [
          {
            tag: {
              id: "tag-vip-id",
              name: "VIP",
              slug: "vip",
              color: "red",
            },
          },
        ],
      };

      render(<ClientForm client={client} />);
      const tagPicker = screen.getByTestId("tag-picker");
      expect(tagPicker.getAttribute("data-selected-ids")).toContain("tag-vip-id");
    });

    it("saving client form preserves existing tags", async () => {
      mocks.customerFindFirst.mockResolvedValue({ id: "cust-tag-test", organizationId: "org-123" });
      mocks.customerUpdate.mockResolvedValue({ id: "cust-tag-test" });

      const client = {
        id: "cust-tag-test",
        name: "Taggy Corp",
        email: "tag@test.com",
        phone: null,
        address: null,
        taxId: null,
        gstin: null,
        defaultTagAssignments: [
          {
            tag: {
              id: "tag-vip-id",
              name: "VIP",
              slug: "vip",
              color: "red",
            },
          },
        ],
      };

      const result = await updateCustomer(client.id, {
        name: client.name,
        tagIds: ["tag-vip-id"],
      });

      expect(result.success).toBe(true);
      expect(mocks.customerUpdate).toHaveBeenCalledWith({
        where: { id: "cust-tag-test" },
        data: {
          name: "Taggy Corp",
        },
      });
      expect(mocks.setCustomerDefaultTags).toHaveBeenCalledWith("cust-tag-test", ["tag-vip-id"]);
    });
  });
});
