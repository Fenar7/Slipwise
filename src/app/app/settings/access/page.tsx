import { requireRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ProxyClient } from "./proxy-client";
import {
  getProxyGrants,
  createProxyGrant,
  revokeProxyGrant,
  getOrgMembersForProxy,
} from "./actions";

export default async function AccessPage() {
  try {
    await requireRole("admin");
  } catch {
    redirect("/app/settings");
  }

  const [grants, members] = await Promise.all([
    getProxyGrants(),
    getOrgMembersForProxy(),
  ]);

  return (
    <ProxyClient
      initialGrants={grants}
      initialMembers={members}
      createGrant={createProxyGrant}
      revokeGrant={revokeProxyGrant}
    />
  );
}
