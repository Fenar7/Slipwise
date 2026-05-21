import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import CustomerCrmPage from "../../crm/customers/[id]/page";
import { redirect } from "next/navigation";

// Mock Next.js redirection behavior
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`Redirected to ${url}`);
  }),
}));

describe("Sprint 2.5 — Duplicate Customer Surface Consolidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Legacy CRM Customer Detail Route Redirect", () => {
    it("redirects cleanly to canonical client detail page preserving the client ID", async () => {
      const params = Promise.resolve({ id: "cust-example-abc" });

      await expect(CustomerCrmPage({ params })).rejects.toThrow("Redirected to /app/clients/cust-example-abc");
      expect(redirect).toHaveBeenCalledWith("/app/clients/cust-example-abc");
    });

    it("handles alternative alphanumeric client IDs correctly", async () => {
      const params = Promise.resolve({ id: "client_999_xyz" });

      await expect(CustomerCrmPage({ params })).rejects.toThrow("Redirected to /app/clients/client_999_xyz");
      expect(redirect).toHaveBeenCalledWith("/app/clients/client_999_xyz");
    });
  });
});
