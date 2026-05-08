import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { headers } from "next/headers";

interface AuditParams {
  orgId: string;
  actorId: string;
  representedId?: string;
  proxyGrantId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  /** Optional: when calling from inside a transaction, read headers before tx and pass them in. */
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await logAuditUnsafe(params);
  } catch (error) {
    // Fire-and-forget: never block the user action
    console.error("[AUDIT] Failed to log:", error);
  }
}

/**
 * Strict audit logging that throws on failure.
 * Use for high-risk mutations (sequence changes, resequencing) where
 * audit persistence is a hard requirement.
 */
export async function logAuditStrict(params: AuditParams): Promise<void> {
  await logAuditUnsafe(params);
}

async function logAuditUnsafe(params: AuditParams): Promise<void> {
  const hdrs = await headers();
  const ipAddress = params.ipAddress ?? (hdrs.get("x-forwarded-for") || hdrs.get("x-real-ip") || null);
  const userAgent = params.userAgent ?? (hdrs.get("user-agent") || null);
  const activeProxy =
    params.representedId || params.proxyGrantId
      ? null
      : await db.proxyGrant.findFirst({
          where: {
            orgId: params.orgId,
            actorId: params.actorId,
            status: "ACTIVE",
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            representedId: true,
          },
        });

  await db.auditLog.create({
    data: {
      orgId: params.orgId,
      actorId: params.actorId,
      representedId:
        params.representedId ?? activeProxy?.representedId ?? null,
      proxyGrantId: params.proxyGrantId ?? activeProxy?.id ?? null,
      action: params.action,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      metadata:
        (params.metadata as Prisma.InputJsonValue) ?? Prisma.DbNull,
      ipAddress,
      userAgent,
    },
  });
}

/**
 * Transactional strict audit logging.
 * Use inside db.$transaction() so the audit row commits atomically with the mutation.
 * Read request headers BEFORE entering the transaction and pass them via ipAddress/userAgent.
 */
export async function logAuditTx(
  tx: Prisma.TransactionClient,
  params: AuditParams
): Promise<void> {
  const activeProxy =
    params.representedId || params.proxyGrantId
      ? null
      : await tx.proxyGrant.findFirst({
          where: {
            orgId: params.orgId,
            actorId: params.actorId,
            status: "ACTIVE",
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            representedId: true,
          },
        });

  await tx.auditLog.create({
    data: {
      orgId: params.orgId,
      actorId: params.actorId,
      representedId:
        params.representedId ?? activeProxy?.representedId ?? null,
      proxyGrantId: params.proxyGrantId ?? activeProxy?.id ?? null,
      action: params.action,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      metadata:
        (params.metadata as Prisma.InputJsonValue) ?? Prisma.DbNull,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  });
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "member.invited": "Invited team member",
  "member.role_changed": "Changed member role",
  "member.deactivated": "Deactivated member",
  "member.removed": "Removed member",
  "sso.config_updated": "Updated SSO configuration",
  "sso.config_deleted": "Deleted SSO configuration",
  "sso.metadata_refreshed": "Refreshed SSO metadata",
  "sso.test_succeeded": "Completed SSO test login",
  "sso.login_succeeded": "Completed SSO login",
  "sso.member_provisioned": "Provisioned member from SSO",
  "sso.break_glass_issued": "Issued break-glass code",
  "sso.break_glass_redeemed": "Redeemed break-glass code",
  "proxy.granted": "Granted proxy access",
  "proxy.revoked": "Revoked proxy access",
  "proxy.action": "Acted via proxy",
  "audit.chain_verified": "Verified audit hash chain",
  "invoice.issued": "Issued invoice",
  "invoice.cancelled": "Cancelled invoice",
  "invoice.reissued": "Reissued invoice",
  "invoice.paid": "Marked invoice paid",
  "proof.accepted": "Accepted payment proof",
  "proof.rejected": "Rejected payment proof",
  "salary.released": "Released salary slip",
  "approval.approved": "Approved request",
  "approval.rejected": "Rejected request",
  "org.settings_changed": "Updated organization settings",
  "org.branding_changed": "Updated branding",
  "cron.executed": "CRON job executed",
  "send.scheduled": "Scheduled send",
  "send.completed": "Send completed",
  "recurring.generated": "Generated recurring invoice",
  "quote_created": "Created quote",
  "quote_updated": "Updated quote",
  "quote_sent": "Sent quote",
  "quote_accepted": "Quote accepted",
  "quote_declined": "Quote declined",
  "quote_converted": "Converted quote to invoice",
  "marketplace.payout_beneficiary.updated": "Updated marketplace payout beneficiary",
  "marketplace.payout_beneficiary.verified": "Verified marketplace payout beneficiary",
  "marketplace.payout_run.created": "Created marketplace payout run",
  "marketplace.payout_run.approved": "Approved marketplace payout run",
  "marketplace.payout_run.executed": "Executed marketplace payout run",
  "marketplace.payout_item.hold": "Held marketplace payout item",
  "marketplace.payout_item.release": "Released marketplace payout item",
  "marketplace.payout_item.paid": "Marked marketplace payout item paid",
  "marketplace.payout_item.failed": "Marked marketplace payout item failed",
  "gst.filing.created": "Created GST filing run",
  "gst.filing.validated": "Validated GST filing run",
  "gst.filing.exported": "Exported GST filing package",
  "gst.filing.submission_intent": "Recorded GST filing submission intent",
  "gst.filing.submission_result": "Recorded GST filing submission result",
  "gst.filing.reconciled": "Recorded GST filing reconciliation",
  "partner.applied": "Partner application submitted",
  "partner.review_started": "Partner application under review",
  "partner.approved": "Partner application approved",
  "partner.rejected": "Partner application rejected",
  "partner.suspended": "Partner account suspended",
  "partner.reinstated": "Partner account reinstated",
  "partner.revoked": "Partner account revoked",
  "partner.client_assigned": "Client organization assigned to partner",
  "partner.client_revoked": "Client organization removed from partner",
  "partner.client_scope_updated": "Partner client assignment scope updated",
  "passkey.added": "Added a passkey",
  "passkey.renamed": "Renamed a passkey",
  "passkey.removed": "Removed a passkey",
  "passkey.used": "Used a passkey for MFA",
  "passkey.challenge_failed": "Passkey challenge failed",
  "totp.enabled": "Enabled authenticator app 2FA",
  "totp.disabled": "Disabled authenticator app 2FA",
  "recovery_code.used": "Used a recovery code",
  "sequence.created": "Created document sequence",
  "sequence.edited": "Edited document sequence",
  "sequence.periodicity_changed": "Changed sequence periodicity",
  "sequence.future_activated": "Activated future sequence format",
  "sequence.continuity_seeded": "Seeded sequence continuity",
  "sequence.resequence_previewed": "Previewed resequence batch",
  "sequence.resequence_confirmed": "Confirmed resequence batch",
  "sequence.locked_attempt_blocked": "Blocked sequence change on locked period",
  "sequence.diagnostics_ran": "Ran sequence diagnostics",
  "tag.created": "Created tag",
  "tag.renamed": "Renamed tag",
  "tag.archived": "Archived tag",
  "tag.unarchived": "Unarchived tag",
  "tag.assigned_invoice": "Assigned tag to invoice",
  "tag.removed_invoice": "Removed tag from invoice",
  "tag.assigned_voucher": "Assigned tag to voucher",
  "tag.removed_voucher": "Removed tag from voucher",
  "tag.bulk_added": "Bulk-added tags to documents",
  "tag.bulk_removed": "Bulk-removed tags from documents",
  "tag.default_customer_set": "Updated customer default tags",
  "tag.default_vendor_set": "Updated vendor default tags",
};
export function getAuditCategory(action: string): string {
  if (
    action.startsWith("member.") ||
    action.startsWith("proxy.") ||
    action.startsWith("sso.")
  )
    return "Access";
  if (
    action.startsWith("invoice.") ||
    action.startsWith("proof.") ||
    action.startsWith("salary.") ||
    action.startsWith("approval.") ||
    action.startsWith("quote_") ||
    action.startsWith("tag.")
  )
    return "Documents";
  if (action.startsWith("gst.")) return "Compliance";
  if (action.startsWith("audit.")) return "System";
  if (action.startsWith("org.")) return "Settings";
  if (action.startsWith("sequence.")) return "Sequences";
  if (action.startsWith("marketplace.")) return "Marketplace";
  if (
    action.startsWith("cron.") ||
    action.startsWith("send.") ||
    action.startsWith("recurring.")
  )
    return "System";
  return "Other";
}
