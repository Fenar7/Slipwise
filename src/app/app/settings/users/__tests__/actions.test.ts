import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOrgContext: vi.fn(),
  requirePermission: vi.fn(),
  checkUsageLimit: vi.fn(),
  logAudit: vi.fn(),
  sendEmail: vi.fn(),
  inviteEmailHtml: vi.fn().mockReturnValue("<html>mock email</html>"),
  revalidatePath: vi.fn(),

  // DB mocks
  memberFindFirst: vi.fn(),
  memberFindMany: vi.fn(),
  memberFindUnique: vi.fn(),
  memberCount: vi.fn(),
  memberUpdate: vi.fn(),
  memberDelete: vi.fn(),

  invitationFindFirst: vi.fn(),
  invitationFindMany: vi.fn(),
  invitationFindUnique: vi.fn(),
  invitationCreate: vi.fn(),
  invitationUpdate: vi.fn(),
  invitationUpdateMany: vi.fn(),
  invitationDeleteMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: mocks.requireOrgContext,
}));

vi.mock("@/lib/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));

vi.mock("@/lib/usage-metering", () => ({
  checkUsageLimit: mocks.checkUsageLimit,
}));

vi.mock("@/lib/audit", () => ({
  logAudit: mocks.logAudit,
}));

vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
}));

vi.mock("@/lib/email-templates/invite-email", () => ({
  inviteEmailHtml: mocks.inviteEmailHtml,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/db", () => ({
  db: {
    member: {
      findFirst: mocks.memberFindFirst,
      findMany: mocks.memberFindMany,
      findUnique: mocks.memberFindUnique,
      count: mocks.memberCount,
      update: mocks.memberUpdate,
      delete: mocks.memberDelete,
    },
    invitation: {
      findFirst: mocks.invitationFindFirst,
      findMany: mocks.invitationFindMany,
      findUnique: mocks.invitationFindUnique,
      create: mocks.invitationCreate,
      update: mocks.invitationUpdate,
      updateMany: mocks.invitationUpdateMany,
      deleteMany: mocks.invitationDeleteMany,
    },
    organization: {
      findUnique: vi.fn().mockResolvedValue({ name: "Test Org" }),
    },
    profile: {
      findUnique: vi.fn().mockResolvedValue({ name: "Test User" }),
    },
  },
}));

import {
  inviteUser,
  updateMemberRole,
  deactivateMember,
  reactivateMember,
  removeMember,
  resendInvitation,
  cancelInvitation,
} from "../actions";

const ORG_ID = "org_test";
const ACTOR_ID = "actor_test";

beforeEach(() => {
  vi.clearAllMocks();
  // Default mocks
  mocks.requireOrgContext.mockResolvedValue({
    orgId: ORG_ID,
    userId: ACTOR_ID,
    role: "admin",
  });
  mocks.requirePermission.mockResolvedValue(undefined);
  mocks.checkUsageLimit.mockResolvedValue({ allowed: true });
});

describe("users/actions.ts unit tests", () => {
  describe("inviteUser", () => {
    it("rejects if actor doesn't have authority to manage the role", async () => {
      // Actor is admin, trying to assign co_owner (or admin since canManageRole("admin", "admin") is false)
      mocks.requireOrgContext.mockResolvedValueOnce({
        orgId: ORG_ID,
        userId: ACTOR_ID,
        role: "admin",
      });
      const res = await inviteUser({ email: "test@test.com", role: "admin" });
      expect(res.success).toBe(false);
      expect(res.error).toContain("You cannot assign the admin role");
    });

    it("rejects if email belongs to an existing member", async () => {
      mocks.requireOrgContext.mockResolvedValueOnce({
        orgId: ORG_ID,
        userId: ACTOR_ID,
        role: "owner", // Owner can assign admin
      });
      mocks.memberFindFirst.mockResolvedValueOnce({ id: "m1" });

      const res = await inviteUser({ email: "existing@test.com", role: "admin" });
      expect(res.success).toBe(false);
      expect(res.error).toBe("User is already a member");
      expect(mocks.memberFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: ORG_ID,
            user: { email: { equals: "existing@test.com", mode: "insensitive" } },
          },
        })
      );
    });

    it("rejects if email already has an active pending invitation", async () => {
      mocks.requireOrgContext.mockResolvedValueOnce({
        orgId: ORG_ID,
        userId: ACTOR_ID,
        role: "owner",
      });
      mocks.memberFindFirst.mockResolvedValueOnce(null);
      // Active pending invite: status pending, expiresAt in future
      mocks.invitationFindFirst.mockResolvedValueOnce({
        id: "inv_1",
        email: "pending@test.com",
        status: "pending",
        expiresAt: new Date(Date.now() + 10000),
      });

      const res = await inviteUser({ email: "pending@test.com", role: "admin" });
      expect(res.success).toBe(false);
      expect(res.error).toBe("An active invitation is already pending for this email");
    });

    it("invalidates expired pending invitation and creates a new one", async () => {
      mocks.requireOrgContext.mockResolvedValueOnce({
        orgId: ORG_ID,
        userId: ACTOR_ID,
        role: "owner",
      });
      mocks.memberFindFirst.mockResolvedValueOnce(null);
      // Expired invitation: status pending, expiresAt in past
      mocks.invitationFindFirst.mockResolvedValueOnce(null); // No active one
      mocks.invitationCreate.mockResolvedValueOnce({ id: "inv_new" });

      const res = await inviteUser({ email: "expired@test.com", role: "admin" });
      expect(res.success).toBe(true);
      expect(mocks.invitationUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: ORG_ID,
            email: { equals: "expired@test.com", mode: "insensitive" },
            status: "pending",
          },
          data: { status: "cancelled" },
        })
      );
      expect(mocks.invitationCreate).toHaveBeenCalled();
      expect(mocks.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "member.invited",
          entityId: "inv_new",
        })
      );
    });
  });

  describe("updateMemberRole", () => {
    it("rejects changing target role to/from deactivated explicitly", async () => {
      mocks.requireOrgContext.mockResolvedValueOnce({
        orgId: ORG_ID,
        userId: ACTOR_ID,
        role: "owner",
      });
      mocks.memberFindUnique.mockResolvedValueOnce({
        id: "m1",
        role: "deactivated",
        organizationId: ORG_ID,
      });

      const res = await updateMemberRole("m1", "viewer");
      expect(res.success).toBe(false);
      expect(res.error).toContain("Cannot change role of a deactivated member");
    });

    it("rejects assigning deactivated role via updateMemberRole", async () => {
      mocks.requireOrgContext.mockResolvedValueOnce({
        orgId: ORG_ID,
        userId: ACTOR_ID,
        role: "owner",
      });
      mocks.memberFindUnique.mockResolvedValueOnce({
        id: "m1",
        role: "viewer",
        organizationId: ORG_ID,
      });

      const res = await updateMemberRole("m1", "deactivated");
      expect(res.success).toBe(false);
      expect(res.error).toContain("Cannot assign the deactivated role via role update");
    });

    it("enforces last-admin protection", async () => {
      mocks.requireOrgContext.mockResolvedValueOnce({
        orgId: ORG_ID,
        userId: ACTOR_ID,
        role: "owner",
      });
      mocks.memberFindUnique.mockResolvedValueOnce({
        id: "m1",
        role: "admin",
        organizationId: ORG_ID,
      });
      mocks.memberCount.mockResolvedValueOnce(1); // Only 1 admin in org

      const res = await updateMemberRole("m1", "viewer");
      expect(res.success).toBe(false);
      expect(res.error).toContain("at least one Admin is required");
    });

    it("rejects owner role reassignment/change", async () => {
      mocks.memberFindUnique.mockResolvedValueOnce({
        id: "m1",
        role: "owner",
        organizationId: ORG_ID,
      });
      const res = await updateMemberRole("m1", "admin");
      expect(res.success).toBe(false);
      expect(res.error).toContain("Cannot change the Owner role");
    });
  });

  describe("deactivateMember", () => {
    it("rejects self-deactivation", async () => {
      mocks.memberFindUnique.mockResolvedValueOnce({
        id: "m1",
        role: "admin",
        userId: ACTOR_ID,
        organizationId: ORG_ID,
      });

      const res = await deactivateMember("m1");
      expect(res.success).toBe(false);
      expect(res.error).toContain("Cannot deactivate yourself");
    });

    it("rejects owner deactivation", async () => {
      mocks.memberFindUnique.mockResolvedValueOnce({
        id: "m1",
        role: "owner",
        userId: "other_user",
        organizationId: ORG_ID,
      });

      const res = await deactivateMember("m1");
      expect(res.success).toBe(false);
      expect(res.error).toContain("Cannot deactivate the Owner");
    });

    it("enforces last-admin deactivation check", async () => {
      mocks.requireOrgContext.mockResolvedValueOnce({
        orgId: ORG_ID,
        userId: ACTOR_ID,
        role: "owner",
      });
      mocks.memberFindUnique.mockResolvedValueOnce({
        id: "m1",
        role: "admin",
        userId: "other_user",
        organizationId: ORG_ID,
      });
      mocks.memberCount.mockResolvedValueOnce(1); // Only 1 admin in org

      const res = await deactivateMember("m1");
      expect(res.success).toBe(false);
      expect(res.error).toContain("at least one Admin is required");
    });

    it("successfully deactivates and logs audit trail", async () => {
      mocks.requireOrgContext.mockResolvedValueOnce({
        orgId: ORG_ID,
        userId: ACTOR_ID,
        role: "owner",
      });
      mocks.memberFindUnique.mockResolvedValueOnce({
        id: "m1",
        role: "admin",
        userId: "other_user",
        organizationId: ORG_ID,
      });
      mocks.memberCount.mockResolvedValueOnce(2); // 2 admins in org

      const res = await deactivateMember("m1");
      expect(res.success).toBe(true);
      expect(mocks.memberUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "m1" },
          data: { role: "deactivated" },
        })
      );
      expect(mocks.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "member.deactivated",
          entityId: "m1",
        })
      );
    });
  });

  describe("reactivateMember", () => {
    it("successfully reactivates to viewer and logs audit", async () => {
      mocks.requireOrgContext.mockResolvedValueOnce({
        orgId: ORG_ID,
        userId: ACTOR_ID,
        role: "admin",
      });
      mocks.memberFindUnique.mockResolvedValueOnce({
        id: "m1",
        role: "deactivated",
        organizationId: ORG_ID,
      });

      const res = await reactivateMember("m1");
      expect(res.success).toBe(true);
      expect(mocks.memberUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "m1" },
          data: { role: "viewer" },
        })
      );
      expect(mocks.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "member.reactivated",
          entityId: "m1",
          metadata: {
            previousRole: "deactivated",
            nextRole: "viewer",
          },
        })
      );
    });
  });

  describe("resendInvitation", () => {
    it("rejects if the invite email matches an existing member", async () => {
      mocks.invitationFindUnique.mockResolvedValueOnce({
        id: "inv_1",
        email: "member@test.com",
        status: "pending",
        organizationId: ORG_ID,
      });
      mocks.memberFindFirst.mockResolvedValueOnce({ id: "m1" });

      const res = await resendInvitation("inv_1");
      expect(res.success).toBe(false);
      expect(res.error).toBe("User is already a member");
    });

    it("resends invite, updates expiry, and logs audit on success", async () => {
      mocks.invitationFindUnique.mockResolvedValueOnce({
        id: "inv_1",
        email: "nonmember@test.com",
        role: "viewer",
        status: "pending",
        organizationId: ORG_ID,
      });
      mocks.memberFindFirst.mockResolvedValueOnce(null);

      const res = await resendInvitation("inv_1");
      expect(res.success).toBe(true);
      expect(mocks.invitationUpdate).toHaveBeenCalled();
      expect(mocks.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "invitation.resent",
          entityId: "inv_1",
        })
      );
    });
  });

  describe("cancelInvitation", () => {
    it("cancels invitation and logs audit on success", async () => {
      mocks.invitationFindUnique.mockResolvedValueOnce({
        id: "inv_1",
        email: "nonmember@test.com",
        role: "viewer",
        status: "pending",
        organizationId: ORG_ID,
      });

      const res = await cancelInvitation("inv_1");
      expect(res.success).toBe(true);
      expect(mocks.invitationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "inv_1" },
          data: { status: "cancelled" },
        })
      );
      expect(mocks.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "invitation.cancelled",
          entityId: "inv_1",
        })
      );
    });
  });
});
