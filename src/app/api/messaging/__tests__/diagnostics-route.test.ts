import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/lib/messaging/read-models", () => ({
  getTaskHealthDiagnostics: vi.fn(),
}));

import { GET } from "../admin/diagnostics/route";
import { requireRole } from "@/lib/auth";
import { getTaskHealthDiagnostics } from "@/lib/messaging/read-models";

const mockedRequireRole = vi.mocked(requireRole);
const mockedGetDiagnostics = vi.mocked(getTaskHealthDiagnostics);

function makeRequest(): NextRequest {
  return new NextRequest(new URL("http://localhost/api/messaging/admin/diagnostics"));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireRole.mockResolvedValue({
    userId: "user-admin",
    orgId: "org-1",
    role: "admin",
    representedId: null,
    proxyGrantId: null,
    proxyScope: [],
  });
});

describe("GET /api/messaging/admin/diagnostics", () => {
  it("returns diagnostics for admin user", async () => {
    mockedGetDiagnostics.mockResolvedValue({
      statusCounts: { OPEN: 5, IN_PROGRESS: 3, DONE: 10, CANCELLED: 2 },
      overdueCount: 3,
      reminderDispatchedCount: 7,
      reminderPendingCount: 2,
    });

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.diagnostics.statusCounts).toEqual({ OPEN: 5, IN_PROGRESS: 3, DONE: 10, CANCELLED: 2 });
    expect(body.diagnostics.overdueCount).toBe(3);
    expect(body.diagnostics.reminderDispatchedCount).toBe(7);
    expect(body.diagnostics.reminderPendingCount).toBe(2);
  });

  it("returns 403 when diagnostics returns null (unexpected for admin)", async () => {
    mockedGetDiagnostics.mockResolvedValue(null);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("denies access for non-admin user", async () => {
    mockedRequireRole.mockRejectedValue(new Error("Insufficient permissions"));

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Insufficient permissions");
  });

  it("denies access for member role user", async () => {
    mockedRequireRole.mockRejectedValue(new Error("Insufficient permissions"));

    const response = await GET(makeRequest());

    expect(response.status).toBe(500);
    expect(mockedGetDiagnostics).not.toHaveBeenCalled();
  });

  it("denies access when unauthenticated", async () => {
    mockedRequireRole.mockRejectedValue(new Error("Unauthorized"));

    const response = await GET(makeRequest());

    expect(response.status).toBe(500);
    expect(mockedGetDiagnostics).not.toHaveBeenCalled();
  });

  it("scopes diagnostics to admin's org", async () => {
    mockedGetDiagnostics.mockResolvedValue({
      statusCounts: {}, overdueCount: 0, reminderDispatchedCount: 0, reminderPendingCount: 0,
    });

    await GET(makeRequest());

    expect(mockedGetDiagnostics).toHaveBeenCalledWith("org-1", "user-admin");
  });

  it("empty org returns zeroed results", async () => {
    mockedGetDiagnostics.mockResolvedValue({
      statusCounts: {},
      overdueCount: 0,
      reminderDispatchedCount: 0,
      reminderPendingCount: 0,
    });

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.diagnostics.statusCounts).toEqual({});
    expect(body.diagnostics.overdueCount).toBe(0);
  });
});
