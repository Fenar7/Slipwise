import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServer: vi.fn(),
  logAudit: vi.fn(),
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

import { acceptInvitation, getInvitationDetails } from "../actions";

const USER_ID = "user_sprint112";
const ORG_ID = "org_sprint112";
const TOKEN = "token_sprint112";

describe("Sprint 11.2 Onboarding and Invite Acceptance Hardening tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getInvitationDetails detects wrong signed-in account", async () => {
    mocks.invitationFindUnique.mockResolvedValueOnce({
      id: TOKEN,
      organizationId: ORG_ID,
      email: "invited@test.com",
      role: "viewer",
      status: "pending",
      expiresAt: new Date(Date.now() + 100000),
      organization: { name: "Test Org" },
    });

    mocks.createSupabaseServer.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: { id: USER_ID, email: "logged_in_wrong@test.com" } },
          error: null,
        }),
      },
    });

    mocks.memberFindUnique.mockResolvedValueOnce(null);

    const details = await getInvitationDetails(TOKEN);
    expect(details).not.toBeNull();
    expect(details?.email).toBe("invited@test.com");
    expect(details?.currentUserEmail).toBe("logged_in_wrong@test.com");
    expect(details?.currentUserMatches).toBe(false);
    expect(details?.isAlreadyMember).toBe(false);
    expect(details?.isDeactivatedMember).toBe(false);
  });

  it("getInvitationDetails detects active membership state", async () => {
    mocks.invitationFindUnique.mockResolvedValueOnce({
      id: TOKEN,
      organizationId: ORG_ID,
      email: "invited@test.com",
      role: "viewer",
      status: "pending",
      expiresAt: new Date(Date.now() + 100000),
      organization: { name: "Test Org" },
    });

    mocks.createSupabaseServer.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: { id: USER_ID, email: "invited@test.com" } },
          error: null,
        }),
      },
    });

    mocks.memberFindUnique.mockResolvedValueOnce({
      userId: USER_ID,
      organizationId: ORG_ID,
      role: "viewer",
    });

    const details = await getInvitationDetails(TOKEN);
    expect(details).not.toBeNull();
    expect(details?.currentUserMatches).toBe(true);
    expect(details?.isAlreadyMember).toBe(true);
    expect(details?.isDeactivatedMember).toBe(false);
  });

  it("getInvitationDetails detects deactivated membership state", async () => {
    mocks.invitationFindUnique.mockResolvedValueOnce({
      id: TOKEN,
      organizationId: ORG_ID,
      email: "invited@test.com",
      role: "viewer",
      status: "pending",
      expiresAt: new Date(Date.now() + 100000),
      organization: { name: "Test Org" },
    });

    mocks.createSupabaseServer.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: { id: USER_ID, email: "invited@test.com" } },
          error: null,
        }),
      },
    });

    mocks.memberFindUnique.mockResolvedValueOnce({
      userId: USER_ID,
      organizationId: ORG_ID,
      role: "deactivated",
    });

    const details = await getInvitationDetails(TOKEN);
    expect(details).not.toBeNull();
    expect(details?.isAlreadyMember).toBe(true);
    expect(details?.isDeactivatedMember).toBe(true);
  });

  it("acceptInvitation fails closed when user has blank or missing email", async () => {
    mocks.createSupabaseServer.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: { id: USER_ID, email: "   " } },
          error: null,
        }),
      },
    });

    mocks.invitationFindUnique.mockResolvedValueOnce({
      id: TOKEN,
      organizationId: ORG_ID,
      email: "invited@test.com",
      role: "viewer",
      status: "pending",
      expiresAt: new Date(Date.now() + 100000),
    });

    const res = await acceptInvitation(TOKEN);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Authenticated user email not found");
  });

  it("acceptInvitation handles Prisma database unique constraint conflicts without leaking raw errors", async () => {
    mocks.createSupabaseServer.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: { id: USER_ID, email: "invited@test.com" } },
          error: null,
        }),
      },
    });

    mocks.invitationFindUnique.mockResolvedValueOnce({
      id: TOKEN,
      organizationId: ORG_ID,
      email: "invited@test.com",
      role: "viewer",
      status: "pending",
      expiresAt: new Date(Date.now() + 100000),
    });

    mocks.memberFindUnique.mockResolvedValueOnce(null);

    // Mock transaction throwing a Prisma unique constraint violation
    const prismaError = new Error("Unique constraint failed");
    (prismaError as any).code = "P2002";
    mocks.transaction.mockRejectedValueOnce(prismaError);

    const res = await acceptInvitation(TOKEN);
    expect(res.success).toBe(false);
    expect(res.error).toBe("You are already a member of this organization");
  });

  it("acceptInvitation fails closed on generic database errors and logs truthfully", async () => {
    mocks.createSupabaseServer.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: { id: USER_ID, email: "invited@test.com" } },
          error: null,
        }),
      },
    });

    mocks.invitationFindUnique.mockResolvedValueOnce({
      id: TOKEN,
      organizationId: ORG_ID,
      email: "invited@test.com",
      role: "viewer",
      status: "pending",
      expiresAt: new Date(Date.now() + 100000),
    });

    mocks.memberFindUnique.mockResolvedValueOnce(null);
    mocks.transaction.mockRejectedValueOnce(new Error("Connection timeout"));

    const res = await acceptInvitation(TOKEN);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Failed to accept invitation"); // Generic safe message
    expect(mocks.logAudit).not.toHaveBeenCalled(); // No successful transition logged
  });
});
