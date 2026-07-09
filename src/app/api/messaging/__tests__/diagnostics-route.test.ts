import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/app/api/messaging/_utils", () => {
  const MockMessagingApiError = class extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  };

  return {
    requireMessagingApiContext: vi.fn(),
    handleMessagingApiError: vi.fn((err: unknown) => {
      if (err instanceof Error) {
        if (err.message === "Unauthorized") {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
        }
        if (err.message === "Forbidden") {
          return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "content-type": "application/json" } });
        }
      }
      return new Response(JSON.stringify({ error: "An unexpected error occurred." }), { status: 500, headers: { "content-type": "application/json" } });
    }),
    MessagingApiError: MockMessagingApiError,
    MessagingApiErrorCode: { UNAUTHORIZED: "UNAUTHORIZED", FORBIDDEN: "FORBIDDEN" },
  };
});

vi.mock("@/lib/auth", () => ({
  hasRole: vi.fn(),
  getOrgContext: vi.fn(),
}));

vi.mock("@/lib/messaging/read-models", () => ({
  getTaskHealthDiagnostics: vi.fn(),
}));

import { GET } from "../admin/diagnostics/route";
import { hasRole } from "@/lib/auth";
import { getTaskHealthDiagnostics } from "@/lib/messaging/read-models";
import * as utils from "@/app/api/messaging/_utils";

const mockedUtils = vi.mocked(utils);
const mockedHasRole = vi.mocked(hasRole);
const mockedGetHealth = vi.mocked(getTaskHealthDiagnostics);

function makeRequest(): NextRequest {
  return new NextRequest(new URL("http://localhost/api/messaging/admin/diagnostics"));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedUtils.requireMessagingApiContext.mockResolvedValue({
    userId: "user-admin",
    orgId: "org-1",
    role: "admin",
  });
  mockedHasRole.mockReturnValue(true);
});

describe("GET /api/messaging/admin/diagnostics", () => {
  it("returns diagnostics for admin user", async () => {
    mockedGetHealth.mockResolvedValue({
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

  it("returns 403 when diagnostics returns null", async () => {
    mockedGetHealth.mockResolvedValue(null);

    const response = await GET(makeRequest());

    expect(response.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    mockedUtils.requireMessagingApiContext.mockRejectedValue(new Error("Unauthorized"));

    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
    expect(mockedGetHealth).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin member user", async () => {
    mockedUtils.requireMessagingApiContext.mockResolvedValue({
      userId: "user-member",
      orgId: "org-1",
      role: "member",
    });
    mockedHasRole.mockReturnValue(false);

    const response = await GET(makeRequest());

    expect(response.status).toBe(403);
    expect(mockedGetHealth).not.toHaveBeenCalled();
  });

  it("returns 403 for viewer role", async () => {
    mockedUtils.requireMessagingApiContext.mockResolvedValue({
      userId: "user-viewer",
      orgId: "org-1",
      role: "viewer",
    });
    mockedHasRole.mockReturnValue(false);

    const response = await GET(makeRequest());
    expect(response.status).toBe(403);
  });

  it("returns 500 for genuine internal exceptions", async () => {
    mockedGetHealth.mockRejectedValue(new Error("Database connection failed"));

    const response = await GET(makeRequest());
    expect(response.status).toBe(500);
  });

  it("scopes diagnostics to admin's org", async () => {
    mockedGetHealth.mockResolvedValue({
      statusCounts: {}, overdueCount: 0, reminderDispatchedCount: 0, reminderPendingCount: 0,
    });

    await GET(makeRequest());

    expect(mockedGetHealth).toHaveBeenCalledWith("org-1", "user-admin");
  });

  it("empty org returns zeroed results", async () => {
    mockedGetHealth.mockResolvedValue({
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
