import { requireOrgContext } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import UsersClient from "./users-client";
import {
  getOrgMembers,
  getPendingInvitations,
  inviteUser,
  updateMemberRole,
  deactivateMember,
  reactivateMember,
  removeMember,
  resendInvitation,
  cancelInvitation,
} from "./actions";

export default async function UsersPage() {
  const ctx = await requireOrgContext();

  if (!hasPermission(ctx.role, "settings_users", "read")) {
    redirect("/app/settings/profile");
  }

  const [members, invitations] = await Promise.all([
    getOrgMembers(),
    getPendingInvitations(),
  ]);

  return (
    <UsersClient
      currentUserId={ctx.userId}
      initialMembers={members}
      initialInvitations={invitations}
      inviteUserAction={inviteUser}
      updateMemberRoleAction={updateMemberRole}
      deactivateMemberAction={deactivateMember}
      reactivateMemberAction={reactivateMember}
      removeMemberAction={removeMember}
      resendInvitationAction={resendInvitation}
      cancelInvitationAction={cancelInvitation}
    />
  );
}
