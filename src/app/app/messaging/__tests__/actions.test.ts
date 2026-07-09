import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/lib/messaging/read-models", () => ({
  getTaskActivityTimeline: vi.fn(),
  getTaskHealthDiagnostics: vi.fn(),
}));

import { requireOrgContext, requireRole } from "@/lib/auth";
import {
  getTaskActivityTimeline,
  getTaskHealthDiagnostics,
} from "@/lib/messaging/read-models";
import {
  getTaskTimeline,
  getTaskDiagnostics,
} from "../actions";

const mockedRequireOrgContext = vi.mocked(requireOrgContext);
const mockedRequireRole = vi.mocked(requireRole);
const mockedGetTaskActivityTimeline = vi.mocked(getTaskActivityTimeline);
const mockedGetTaskHealthDiagnostics = vi.mocked(getTaskHealthDiagnostics);

function makeTimelineEvent(overrides: Record<string, unknown> = {}) {
  return {
    action: "TASK_CREATED",
    label: "Created task",
    summary: "Task created: Test",
    actorId: "user-1",
    createdAt: new Date("2026-05-15T10:00:00Z"),
    metadata: null,
    eventType: "task_created",
    ...overrides,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireOrgContext.mockResolvedValue({
    userId: "user-1",
    orgId: "org-1",
    role: "admin",
    representedId: null,
    proxyGrantId: null,
    proxyScope: [],
  });
  mockedRequireRole.mockResolvedValue({
    userId: "user-1",
    orgId: "org-1",
    role: "admin",
    representedId: null,
    proxyGrantId: null,
    proxyScope: [],
  });
});

describe("getTaskTimeline — server action", () => {
  it("returns timeline for allowed participant", async () => {
    const events = [makeTimelineEvent(), makeTimelineEvent({ action: "TASK_COMPLETED", eventType: "task_completed" })];
    mockedGetTaskActivityTimeline.mockResolvedValue(events);

    const result = await getTaskTimeline("task-1");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
    }
    expect(mockedGetTaskActivityTimeline).toHaveBeenCalledWith("org-1", "task-1", "user-1");
  });

  it("returns null for non-member (no leakage)", async () => {
    mockedGetTaskActivityTimeline.mockResolvedValue(null);

    const result = await getTaskTimeline("task-1");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeNull();
    }
  });

  it("returns error on auth failure", async () => {
    mockedRequireOrgContext.mockRejectedValue(new Error("Authentication required"));

    const result = await getTaskTimeline("task-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Authentication required");
    }
  });

  it("returns error on service failure", async () => {
    mockedGetTaskActivityTimeline.mockRejectedValue(new Error("Database error"));

    const result = await getTaskTimeline("task-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Database error");
    }
  });

  it("scopes to correct org", async () => {
    mockedGetTaskActivityTimeline.mockResolvedValue([]);

    await getTaskTimeline("task-1");

    expect(mockedGetTaskActivityTimeline).toHaveBeenCalledWith("org-1", "task-1", "user-1");
    const calls = mockedGetTaskActivityTimeline.mock.calls[0];
    expect(calls[0]).toBe("org-1");
  });
});

describe("getTaskDiagnostics — server action", () => {
  it("returns diagnostics for admin user", async () => {
    const diagnostics = {
      statusCounts: { OPEN: 5, DONE: 10 },
      overdueCount: 3,
      reminderDispatchedCount: 7,
      reminderPendingCount: 2,
    };
    mockedGetTaskHealthDiagnostics.mockResolvedValue(diagnostics);

    const result = await getTaskDiagnostics();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(diagnostics);
    }
    expect(mockedGetTaskHealthDiagnostics).toHaveBeenCalledWith("org-1", "user-1");
  });

  it("returns error for non-admin user", async () => {
    mockedRequireRole.mockRejectedValue(new Error("Insufficient permissions"));

    const result = await getTaskDiagnostics();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Insufficient permissions");
    }
    expect(mockedGetTaskHealthDiagnostics).not.toHaveBeenCalled();
  });

  it("returns null when diagnostics unavailable (should not happen with admin)", async () => {
    mockedGetTaskHealthDiagnostics.mockResolvedValue(null);

    const result = await getTaskDiagnostics();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeNull();
    }
  });

  it("scopes diagnostics to admin's org", async () => {
    mockedGetTaskHealthDiagnostics.mockResolvedValue({
      statusCounts: {}, overdueCount: 0, reminderDispatchedCount: 0, reminderPendingCount: 0,
    });

    await getTaskDiagnostics();

    expect(mockedGetTaskHealthDiagnostics).toHaveBeenCalledWith("org-1", "user-1");
  });

  it("admin access denied for member role", async () => {
    mockedRequireRole.mockRejectedValue(new Error("Insufficient permissions"));

    const result = await getTaskDiagnostics();

    expect(result.success).toBe(false);
  });
});
