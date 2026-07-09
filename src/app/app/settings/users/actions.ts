"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions-server";
import { sendEmail } from "@/lib/email";
import { inviteEmailHtml } from "@/lib/email-templates/invite-email";
import { revalidatePath } from "next/cache";
import { checkUsageLimit } from "@/lib/usage-metering";
import { logAudit } from "@/lib/audit";
import { canManageRole } from "@/lib/auth/rbac/permissions";

export type ActionResult = { success: boolean; error?: string };

export interface MemberWithProfile {
  id: string;
  userId: string;
  role: string;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  };
}

export interface InvitationRow {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: Date;
  inviterId: string;
}

export async function getOrgMembers(): Promise<MemberWithProfile[]> {
  const { orgId, userId } = await requireOrgContext();
  await requirePermission(orgId, userId, "settings_users", "read");

  const members = await db.member.findMany({
    where: { organizationId: orgId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  return members.map((m) => ({
    id: m.id,
    userId: m.userId,
    role: m.role,
    createdAt: m.createdAt,
    user: {
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
    },
  }));
}

export async function getPendingInvitations(): Promise<InvitationRow[]> {
  const { orgId, userId } = await requireOrgContext();
  await requirePermission(orgId, userId, "settings_users", "read");

  const invitations = await db.invitation.findMany({
    where: { organizationId: orgId, status: "pending" },
    orderBy: { expiresAt: "desc" },
  });

  return invitations.map((inv) => ({
    id: inv.id,
    email: inv.email,
    role: inv.role,
    status: inv.status,
    expiresAt: inv.expiresAt,
    inviterId: inv.inviterId,
  }));
}

export async function inviteUser(data: {
  email: string;
  role: string;
}): Promise<ActionResult> {
  try {
    const { orgId, userId, role: actorRole } = await requireOrgContext();
    await requirePermission(orgId, userId, "settings_users", "create");

    if (!canManageRole(actorRole, data.role)) {
      return {
        success: false,
        error: `You cannot assign the ${data.role} role from your current ${actorRole} role.`,
      };
    }

    const limitCheck = await checkUsageLimit(orgId, "TEAM_MEMBER");
    if (!limitCheck.allowed) {
      return {
        success: false,
        error: `Team member limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your plan to invite more members.`,
      };
    }

    const email = data.email.trim().toLowerCase();

    const existing = await db.member.findFirst({
      where: {
        organizationId: orgId,
        user: { email: { equals: email, mode: "insensitive" } },
      },
    });
    if (existing) {
      return { success: false, error: "User is already a member" };
    }

    const activeInvite = await db.invitation.findFirst({
      where: {
        organizationId: orgId,
        email: { equals: email, mode: "insensitive" },
        status: "pending",
        expiresAt: { gt: new Date() },
      },
    });
    if (activeInvite) {
      return { success: false, error: "An active invitation is already pending for this email" };
    }

    // Invalidate any other pending (expired) invitations for the same email in this org
    await db.invitation.updateMany({
      where: {
        organizationId: orgId,
        email: { equals: email, mode: "insensitive" },
        status: "pending",
      },
      data: { status: "cancelled" },
    });

    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    const invitation = await db.invitation.create({
      data: {
        organizationId: orgId,
        email,
        role: data.role,
        status: "pending",
        expiresAt,
        inviterId: userId,
      },
    });

    const [org, inviter] = await Promise.all([
      db.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
      db.profile.findUnique({ where: { id: userId }, select: { name: true } }),
    ]);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
    const acceptUrl = `${appUrl}/auth/accept-invite?token=${invitation.id}`;

    await sendEmail({
      to: email,
      subject: `You've been invited to ${org?.name ?? "an organization"} on Slipwise`,
      html: inviteEmailHtml({
        orgName: org?.name ?? "Organization",
        inviterName: inviter?.name ?? "A team member",
        role: data.role,
        acceptUrl,
      }),
    });

    await logAudit({
      orgId,
      actorId: userId,
      action: "member.invited",
      entityType: "Invitation",
      entityId: invitation.id,
      metadata: {
        email,
        role: data.role,
        expiresAt: expiresAt.toISOString(),
      },
    });

    revalidatePath("/app/settings/users");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to invite user",
    };
  }
}


export async function updateMemberRole(
  memberId: string,
  role: string
): Promise<ActionResult> {
  try {
    const { orgId, userId, role: actorRole } = await requireOrgContext();
    await requirePermission(orgId, userId, "settings_users", "edit");

    const target = await db.member.findUnique({
      where: { id: memberId },
      select: { role: true, organizationId: true },
    });

    if (!target || target.organizationId !== orgId) {
      return { success: false, error: "Member not found" };
    }

    if (target.role === "owner") {
      return { success: false, error: "Cannot change the Owner role" };
    }

    if (role === "owner") {
      return { success: false, error: "Cannot assign the Owner role" };
    }

    if (target.role === "deactivated") {
      return { success: false, error: "Cannot change role of a deactivated member. Use reactivation flow instead." };
    }

    if (role === "deactivated") {
      return { success: false, error: "Cannot assign the deactivated role via role update. Use deactivation flow instead." };
    }

    if (!canManageRole(actorRole, target.role) || !canManageRole(actorRole, role)) {
      return {
        success: false,
        error: `You cannot change ${target.role} to ${role} from your current ${actorRole} role.`,
      };
    }

    // If changing from admin, ensure at least 1 admin remains
    if (target.role === "admin" && role !== "admin") {
      const adminCount = await db.member.count({
        where: { organizationId: orgId, role: "admin" },
      });
      if (adminCount <= 1) {
        return {
          success: false,
          error: "Cannot change role — at least one Admin is required",
        };
      }
    }

    await db.member.update({
      where: { id: memberId },
      data: { role },
    });

    await logAudit({
      orgId,
      actorId: userId,
      action: "member.role_changed",
      entityType: "Member",
      entityId: memberId,
      metadata: {
        previousRole: target.role,
        nextRole: role,
      },
    });

    revalidatePath("/app/settings/users");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update role",
    };
  }
}

export async function deactivateMember(
  memberId: string
): Promise<ActionResult> {
  try {
    const { orgId, userId, role: actorRole } = await requireOrgContext();
    await requirePermission(orgId, userId, "settings_users", "edit");

    const target = await db.member.findUnique({
      where: { id: memberId },
      select: { role: true, userId: true, organizationId: true },
    });

    if (!target || target.organizationId !== orgId) {
      return { success: false, error: "Member not found" };
    }

    if (target.role === "owner") {
      return { success: false, error: "Cannot deactivate the Owner" };
    }

    if (target.userId === userId) {
      return { success: false, error: "Cannot deactivate yourself" };
    }

    if (!canManageRole(actorRole, target.role)) {
      return {
        success: false,
        error: `You cannot deactivate a ${target.role} from your current ${actorRole} role.`,
      };
    }

    // If deactivating an admin, ensure at least 1 admin remains
    if (target.role === "admin") {
      const adminCount = await db.member.count({
        where: { organizationId: orgId, role: "admin" },
      });
      if (adminCount <= 1) {
        return {
          success: false,
          error: "Cannot deactivate — at least one Admin is required",
        };
      }
    }

    await db.member.update({
      where: { id: memberId },
      data: { role: "deactivated" },
    });

    await logAudit({
      orgId,
      actorId: userId,
      action: "member.deactivated",
      entityType: "Member",
      entityId: memberId,
      metadata: {
        previousRole: target.role,
      },
    });

    revalidatePath("/app/settings/users");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to deactivate member",
    };
  }
}

export async function reactivateMember(
  memberId: string
): Promise<ActionResult> {
  try {
    const { orgId, userId, role: actorRole } = await requireOrgContext();
    await requirePermission(orgId, userId, "settings_users", "edit");

    const target = await db.member.findUnique({
      where: { id: memberId },
      select: { role: true, organizationId: true },
    });

    if (!target || target.organizationId !== orgId) {
      return { success: false, error: "Member not found" };
    }

    if (target.role !== "deactivated") {
      return { success: false, error: "Member is not deactivated" };
    }

    if (!canManageRole(actorRole, "viewer")) {
      return {
        success: false,
        error: `You cannot reactivate members from your current ${actorRole} role.`,
      };
    }

    await db.member.update({
      where: { id: memberId },
      data: { role: "viewer" },
    });

    await logAudit({
      orgId,
      actorId: userId,
      action: "member.reactivated",
      entityType: "Member",
      entityId: memberId,
      metadata: {
        previousRole: "deactivated",
        nextRole: "viewer",
      },
    });

    revalidatePath("/app/settings/users");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to reactivate member",
    };
  }
}

export async function removeMember(memberId: string): Promise<ActionResult> {
  try {
    const { orgId, userId, role: actorRole } = await requireOrgContext();
    await requirePermission(orgId, userId, "settings_users", "delete");

    const target = await db.member.findUnique({
      where: { id: memberId },
      select: { role: true, userId: true, organizationId: true },
    });

    if (!target || target.organizationId !== orgId) {
      return { success: false, error: "Member not found" };
    }

    if (target.role === "owner") {
      return { success: false, error: "Cannot remove the Owner" };
    }

    if (target.userId === userId) {
      return { success: false, error: "Cannot remove yourself" };
    }

    if (!canManageRole(actorRole, target.role)) {
      return {
        success: false,
        error: `You cannot remove a ${target.role} from your current ${actorRole} role.`,
      };
    }

    // If removing an admin, ensure at least 1 admin remains
    if (target.role === "admin") {
      const adminCount = await db.member.count({
        where: { organizationId: orgId, role: "admin" },
      });
      if (adminCount <= 1) {
        return {
          success: false,
          error: "Cannot remove — at least one Admin is required",
        };
      }
    }

    await db.member.delete({ where: { id: memberId } });

    await logAudit({
      orgId,
      actorId: userId,
      action: "member.removed",
      entityType: "Member",
      entityId: memberId,
      metadata: {
        removedUserId: target.userId,
        previousRole: target.role,
      },
    });

    revalidatePath("/app/settings/users");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to remove member",
    };
  }
}

export async function resendInvitation(
  invitationId: string
): Promise<ActionResult> {
  try {
    const { orgId, userId } = await requireOrgContext();
    await requirePermission(orgId, userId, "settings_users", "create");

    const invitation = await db.invitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation || invitation.organizationId !== orgId) {
      return { success: false, error: "Invitation not found" };
    }

    if (invitation.status !== "pending") {
      return { success: false, error: "Invitation is no longer pending" };
    }

    // Check if the user is already a member (active or deactivated)
    const existingMember = await db.member.findFirst({
      where: {
        organizationId: orgId,
        user: { email: { equals: invitation.email, mode: "insensitive" } },
      },
    });
    if (existingMember) {
      return { success: false, error: "User is already a member" };
    }

    const newExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000);
    await db.invitation.update({
      where: { id: invitationId },
      data: { expiresAt: newExpiry },
    });

    const [org, inviter] = await Promise.all([
      db.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
      db.profile.findUnique({ where: { id: userId }, select: { name: true } }),
    ]);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
    const acceptUrl = `${appUrl}/auth/accept-invite?token=${invitation.id}`;

    await sendEmail({
      to: invitation.email,
      subject: `Reminder: You've been invited to ${org?.name ?? "an organization"} on Slipwise`,
      html: inviteEmailHtml({
        orgName: org?.name ?? "Organization",
        inviterName: inviter?.name ?? "A team member",
        role: invitation.role ?? "viewer",
        acceptUrl,
      }),
    });

    await logAudit({
      orgId,
      actorId: userId,
      action: "invitation.resent",
      entityType: "Invitation",
      entityId: invitationId,
      metadata: {
        email: invitation.email,
        role: invitation.role,
        expiresAt: newExpiry.toISOString(),
      },
    });

    revalidatePath("/app/settings/users");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to resend invitation",
    };
  }
}

export async function cancelInvitation(
  invitationId: string
): Promise<ActionResult> {
  try {
    const { orgId, userId } = await requireOrgContext();
    await requirePermission(orgId, userId, "settings_users", "delete");

    const invitation = await db.invitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation || invitation.organizationId !== orgId) {
      return { success: false, error: "Invitation not found" };
    }

    if (invitation.status !== "pending") {
      return { success: false, error: "Invitation is no longer pending" };
    }

    await db.invitation.update({
      where: { id: invitationId },
      data: { status: "cancelled" },
    });

    await logAudit({
      orgId,
      actorId: userId,
      action: "invitation.cancelled",
      entityType: "Invitation",
      entityId: invitationId,
      metadata: {
        email: invitation.email,
        role: invitation.role,
      },
    });

    revalidatePath("/app/settings/users");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to cancel invitation",
    };
  }
}
