import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServer: vi.fn(),
  memberFindMany: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServer: mocks.createSupabaseServer,
}));

vi.mock("@/lib/db", () => ({
  db: {
    member: {
      findMany: mocks.memberFindMany,
    },
  },
}));

import { checkResetPasswordState } from "../actions";

describe("reset-password/actions.ts unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails if user is not authenticated", async () => {
    mocks.createSupabaseServer.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: null },
          error: new Error("No user"),
        }),
      },
    });

    const res = await checkResetPasswordState();
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invalid or expired recovery link");
  });

  it("fails if user is deactivated in all organizations", async () => {
    mocks.createSupabaseServer.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: { id: "user_123", email: "user@test.com" } },
          error: null,
        }),
      },
    });
    mocks.memberFindMany.mockResolvedValueOnce([
      { role: "deactivated" },
      { role: "deactivated" },
    ]);

    const res = await checkResetPasswordState();
    expect(res.success).toBe(false);
    expect(res.error).toContain("Your account is deactivated");
  });

  it("succeeds if user has at least one active organization membership", async () => {
    mocks.createSupabaseServer.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: { id: "user_123", email: "user@test.com" } },
          error: null,
        }),
      },
    });
    mocks.memberFindMany.mockResolvedValueOnce([
      { role: "deactivated" },
      { role: "viewer" },
    ]);

    const res = await checkResetPasswordState();
    expect(res.success).toBe(true);
    expect(res.userEmail).toBe("user@test.com");
  });

  it("succeeds if user has no organization memberships yet", async () => {
    mocks.createSupabaseServer.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: { id: "user_123", email: "user@test.com" } },
          error: null,
        }),
      },
    });
    mocks.memberFindMany.mockResolvedValueOnce([]);

    const res = await checkResetPasswordState();
    expect(res.success).toBe(true);
    expect(res.userEmail).toBe("user@test.com");
  });
});
