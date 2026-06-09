import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServer: vi.fn(),
  logAudit: vi.fn(),
  
  // DB mocks
  invitationFindUnique: vi.fn(),
  invitationUpdate: vi.fn(),
  memberFindUnique: vi.fn(),
  memberCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServer: mocks.createSupabaseServer,
}));

vi.mock("@/lib/audit", () => ({
  logAudit: mocks.logAudit,
}));

vi.mock("@/lib/db", () => ({
  db: {
    invitation: {
      findUnique: mocks.invitationFindUnique,
      update: mocks.invitationUpdate,
    },
    member: {
      findUnique: mocks.memberFindUnique,
      create: mocks.memberCreate,
    },
    $transaction: mocks.transaction,
  },
}));

import { acceptInvitation } from "../actions";

const USER_ID = "user_123";
const ORG_ID = "org_123";
const TOKEN = "token_123";

beforeEach(() => {
  vi.clearAllMocks();
  
  mocks.createSupabaseServer.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: USER_ID, email: "user@test.com" } },
        error: null,
      }),
    },
  });
});

describe("accept-invite/actions.ts unit tests", () => {
  it("rejects if user is not authenticated", async () => {
    mocks.createSupabaseServer.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error("Auth error"),
        }),
      },
    });

    const res = await acceptInvitation(TOKEN);
    expect(res.success).toBe(false);
    expect(res.error).toBe("You must be signed in to accept an invitation");
  });

  it("rejects if invitation is not found", async () => {
    mocks.invitationFindUnique.mockResolvedValueOnce(null);

    const res = await acceptInvitation(TOKEN);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Invitation not found");
  });

  it("rejects if invitation is cancelled", async () => {
    mocks.invitationFindUnique.mockResolvedValueOnce({
      id: TOKEN,
      status: "cancelled",
      organizationId: ORG_ID,
      expiresAt: new Date(Date.now() + 10000),
    });

    const res = await acceptInvitation(TOKEN);
    expect(res.success).toBe(false);
    expect(res.error).toBe("This invitation has been cancelled");
  });

  it("rejects if invitation is already accepted/used", async () => {
    mocks.invitationFindUnique.mockResolvedValueOnce({
      id: TOKEN,
      status: "accepted",
      organizationId: ORG_ID,
      expiresAt: new Date(Date.now() + 10000),
    });

    const res = await acceptInvitation(TOKEN);
    expect(res.success).toBe(false);
    expect(res.error).toBe("This invitation has already been used");
  });

  it("rejects if invitation has expired", async () => {
    mocks.invitationFindUnique.mockResolvedValueOnce({
      id: TOKEN,
      status: "pending",
      organizationId: ORG_ID,
      expiresAt: new Date(Date.now() - 10000), // Expired
    });

    const res = await acceptInvitation(TOKEN);
    expect(res.success).toBe(false);
    expect(res.error).toBe("This invitation has expired");
  });

  it("rejects if user is already an active member", async () => {
    mocks.invitationFindUnique.mockResolvedValueOnce({
      id: TOKEN,
      status: "pending",
      organizationId: ORG_ID,
      email: "user@test.com",
      expiresAt: new Date(Date.now() + 10000),
    });
    mocks.memberFindUnique.mockResolvedValueOnce({
      userId: USER_ID,
      organizationId: ORG_ID,
      role: "viewer",
    });

    const res = await acceptInvitation(TOKEN);
    expect(res.success).toBe(false);
    expect(res.error).toBe("You are already a member of this organization");
  });

  it("rejects if user is already a deactivated member", async () => {
    mocks.invitationFindUnique.mockResolvedValueOnce({
      id: TOKEN,
      status: "pending",
      organizationId: ORG_ID,
      email: "user@test.com",
      expiresAt: new Date(Date.now() + 10000),
    });
    mocks.memberFindUnique.mockResolvedValueOnce({
      userId: USER_ID,
      organizationId: ORG_ID,
      role: "deactivated",
    });

    const res = await acceptInvitation(TOKEN);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Your membership in this organization is deactivated");
  });

  it("successfully accepts invitation, creates member, and logs audit on success", async () => {
    mocks.invitationFindUnique.mockResolvedValueOnce({
      id: TOKEN,
      status: "pending",
      organizationId: ORG_ID,
      email: "user@test.com",
      role: "viewer",
      expiresAt: new Date(Date.now() + 10000),
    });
    mocks.memberFindUnique.mockResolvedValueOnce(null);

    const res = await acceptInvitation(TOKEN);
    if (!res.success) {
      console.log("TEST FAILURE ERROR:", res.error);
    }
    expect(res.success).toBe(true);
    expect(mocks.transaction).toHaveBeenCalled();
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        actorId: USER_ID,
        action: "invitation.accepted",
        entityId: TOKEN,
      })
    );
  });

  it("rejects if authenticated user email does not match invitation email", async () => {
    mocks.invitationFindUnique.mockResolvedValueOnce({
      id: TOKEN,
      status: "pending",
      organizationId: ORG_ID,
      email: "different@test.com",
      role: "viewer",
      expiresAt: new Date(Date.now() + 10000),
    });
    mocks.memberFindUnique.mockResolvedValueOnce(null);

    const res = await acceptInvitation(TOKEN);
    expect(res.success).toBe(false);
    expect(res.error).toContain("This invitation was sent to a different email address");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("rejects if authenticated user has no email", async () => {
    mocks.createSupabaseServer.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: USER_ID } },
          error: null,
        }),
      },
    });
    mocks.invitationFindUnique.mockResolvedValueOnce({
      id: TOKEN,
      status: "pending",
      organizationId: ORG_ID,
      email: "user@test.com",
      role: "viewer",
      expiresAt: new Date(Date.now() + 10000),
    });

    const res = await acceptInvitation(TOKEN);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Authenticated user email not found");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
