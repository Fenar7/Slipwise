import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import PortalActivityPage from "../page";
import { getPortalAccessLogs } from "../../actions";
import React from "react";

// Mock hooks
const mockUseActiveOrg = vi.hoisted(() => vi.fn(() => ({ activeOrg: { id: "org_001", name: "Acme", slug: "acme" } })));
const mockUsePermissions = vi.hoisted(() => vi.fn(() => ({ role: "admin" })));

vi.mock("@/hooks/use-active-org", () => ({ useActiveOrg: mockUseActiveOrg }));
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: mockUsePermissions }));

// Mock getPortalAccessLogs action
vi.mock("../../actions", () => ({
  getPortalAccessLogs: vi.fn(),
}));

const mockLogs = [
  {
    id: "log_1",
    path: "/portal/acme/auth/login",
    action: "otp_verified",
    ip: "1.1.1.1",
    statusCode: 200,
    accessedAt: "2026-06-02T12:00:00.000Z",
    customer: { id: "cust_1", name: "John Doe", email: "john@example.com" },
  },
];

describe("PortalActivityPage Filter UI behavior", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(getPortalAccessLogs).mockReset();
    vi.mocked(getPortalAccessLogs).mockResolvedValue({
      logs: mockLogs,
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("performs initial load of access logs", async () => {
    render(<PortalActivityPage />);
    
    await waitFor(() => {
      expect(getPortalAccessLogs).toHaveBeenCalledTimes(1);
    });

    expect(getPortalAccessLogs).toHaveBeenCalledWith("org_001", {
      customerId: undefined,
      action: undefined,
      path: undefined,
      statusCode: undefined,
      fromDate: undefined,
      toDate: undefined,
      page: 1,
      pageSize: 25,
    });

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("otp_verified")).toBeInTheDocument();
  });

  it("does not auto-fetch logs while typing/changing filters, only when Apply Filters is clicked", async () => {
    render(<PortalActivityPage />);
    
    await waitFor(() => {
      expect(getPortalAccessLogs).toHaveBeenCalledTimes(1);
    });

    // Reset mock calls count to verify further events
    vi.mocked(getPortalAccessLogs).mockClear();

    // Type into the customer ID filter input
    const customerInput = screen.getByPlaceholderText("Filter by customer ID");
    fireEvent.change(customerInput, { target: { value: "cust_999" } });

    // Type into action filter input
    const actionInput = screen.getByPlaceholderText("e.g. otp_verified");
    fireEvent.change(actionInput, { target: { value: "otp_requested" } });

    // Wait a brief moment to ensure no auto-fetch occurred
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(getPortalAccessLogs).not.toHaveBeenCalled();

    // Now click apply filters button
    const applyButton = screen.getByRole("button", { name: "Apply Filters" });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(getPortalAccessLogs).toHaveBeenCalledTimes(1);
    });

    expect(getPortalAccessLogs).toHaveBeenCalledWith("org_001", {
      customerId: "cust_999",
      action: "otp_requested",
      path: undefined,
      statusCode: undefined,
      fromDate: undefined,
      toDate: undefined,
      page: 1,
      pageSize: 25,
    });
  });

  it("resets draft and applied filters on clear", async () => {
    render(<PortalActivityPage />);
    
    await waitFor(() => {
      expect(getPortalAccessLogs).toHaveBeenCalledTimes(1);
    });

    // Reset mock calls count
    vi.mocked(getPortalAccessLogs).mockClear();

    // Type and apply a filter
    const customerInput = screen.getByPlaceholderText("Filter by customer ID");
    fireEvent.change(customerInput, { target: { value: "cust_999" } });
    
    const applyButton = screen.getByRole("button", { name: "Apply Filters" });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(getPortalAccessLogs).toHaveBeenCalledTimes(1);
    });

    expect(getPortalAccessLogs).toHaveBeenCalledWith("org_001", expect.objectContaining({ customerId: "cust_999" }));
    vi.mocked(getPortalAccessLogs).mockClear();

    // Click clear
    const clearButton = screen.getByRole("button", { name: "Clear" });
    fireEvent.click(clearButton);

    await waitFor(() => {
      expect(getPortalAccessLogs).toHaveBeenCalledTimes(1);
    });

    // Verify filters are cleared
    expect(getPortalAccessLogs).toHaveBeenCalledWith("org_001", {
      customerId: undefined,
      action: undefined,
      path: undefined,
      statusCode: undefined,
      fromDate: undefined,
      toDate: undefined,
      page: 1,
      pageSize: 25,
    });

    // Verify input elements are empty
    expect(customerInput).toHaveValue("");
  });
});
