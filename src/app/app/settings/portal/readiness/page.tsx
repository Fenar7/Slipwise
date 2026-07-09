import { CheckCircle, XCircle, AlertCircle, ExternalLink } from "lucide-react";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Portal Readiness – Slipwise" };

interface CheckItem {
  id: string;
  label: string;
  description: string;
  status: "pass" | "fail" | "warn";
  actionHref?: string;
  actionLabel?: string;
}

async function buildChecklist(orgId: string): Promise<CheckItem[]> {
  const [org, branding, whiteLabel, domain, emailDomain] = await Promise.all([
    db.organization.findUnique({
      where: { id: orgId },
      select: {
        name: true,
        slug: true,
        logo: true,
        defaults: {
          select: {
            portalEnabled: true,
            portalSupportEmail: true,
            portalSupportPhone: true,
            portalHeaderMessage: true,
            portalMagicLinkExpiryHours: true,
            portalSessionExpiryHours: true,
          },
        },
      },
    }),
    db.brandingProfile.findUnique({ where: { organizationId: orgId } }),
    db.orgWhiteLabel.findUnique({ where: { orgId } }),
    db.orgDomain.findFirst({ where: { orgId } }),
    db.orgEmailDomain.findFirst({ where: { orgId } }),
  ]);

  const items: CheckItem[] = [];

  // 1. Portal enabled
  items.push({
    id: "portal-enabled",
    label: "Client portal is enabled",
    description: "The portal must be enabled in settings before customers can access it.",
    status: org?.defaults?.portalEnabled ? "pass" : "fail",
    actionHref: "/app/settings/portal",
    actionLabel: "Enable portal",
  });

  // 2. Support contact
  const hasSupportContact = !!(org?.defaults?.portalSupportEmail || org?.defaults?.portalSupportPhone);
  items.push({
    id: "support-contact",
    label: "Support contact configured",
    description: "A support email or phone number is displayed in the portal footer and helps customers reach you.",
    status: hasSupportContact ? "pass" : "warn",
    actionHref: "/app/settings/portal",
    actionLabel: "Set support contact",
  });

  // 3. Branding configured
  const hasBranding = !!(branding?.accentColor || branding?.logoUrl);
  items.push({
    id: "branding",
    label: "Brand colors and logo configured",
    description: "Set your logo and accent color so the portal reflects your brand identity.",
    status: hasBranding ? "pass" : "warn",
    actionHref: "/app/settings/branding",
    actionLabel: "Configure branding",
  });

  // 4. Custom domain verified
  const domainVerified = domain?.verified === true;
  items.push({
    id: "custom-domain",
    label: "Custom domain verified",
    description: "A verified custom domain lets customers access the portal at your own domain (e.g., portal.yourco.com).",
    status: domainVerified ? "pass" : "warn",
    actionHref: "/app/settings/domain",
    actionLabel: "Set up custom domain",
  });

  // 5. Email domain identity
  const hasEmailDomain = !!emailDomain;
  items.push({
    id: "email-identity",
    label: "Sending email domain configured",
    description: "Configure your email domain so portal magic links and notifications come from your own domain.",
    status: hasEmailDomain ? "pass" : "warn",
    actionHref: "/app/settings/email",
    actionLabel: "Configure email domain",
  });

  // 6. White-label / branding removal
  const removeBranding = whiteLabel?.removeBranding === true;
  items.push({
    id: "white-label",
    label: "Powered by Slipwise visibility",
    description: removeBranding
      ? "White-label is active — the Slipwise branding is hidden from customers."
      : "The &apos;Powered by Slipwise&apos; badge is visible in the portal footer. Upgrade your plan to remove it.",
    status: removeBranding ? "pass" : "warn",
    actionHref: removeBranding ? undefined : "/app/settings/billing",
    actionLabel: removeBranding ? undefined : "Upgrade plan",
  });

  // 7. Session security settings
  const sessionExpiry = org?.defaults?.portalSessionExpiryHours ?? 168;
  items.push({
    id: "session-security",
    label: "Session expiry configured",
    description: `Portal sessions expire after ${sessionExpiry} hours. Shorter expiry improves security.`,
    status: sessionExpiry <= 72 ? "pass" : "warn",
    actionHref: "/app/settings/portal/policies",
    actionLabel: "Configure policies",
  });

  // 8. Magic link expiry security bounds
  const magicLinkExpiry = org?.defaults?.portalMagicLinkExpiryHours ?? 1;
  items.push({
    id: "magic-link-expiry",
    label: "Magic link expiry bounds",
    description: magicLinkExpiry >= 1 && magicLinkExpiry <= 2
      ? `Magic links expire after ${magicLinkExpiry} hour${magicLinkExpiry > 1 ? "s" : ""}. This is within the secure recommended range.`
      : `Magic links expire after ${magicLinkExpiry} hour${magicLinkExpiry > 1 ? "s" : ""}. We recommend setting expiry to 1-2 hours to minimize interception risk.`,
    status: magicLinkExpiry >= 1 && magicLinkExpiry <= 2 ? "pass" : "warn",
    actionHref: "/app/settings/portal/policies",
    actionLabel: "Configure policies",
  });

  // 9. Warning items for enabled customers missing primary email addresses
  const enabledWithMissingEmailCount = await db.customer.count({
    where: {
      organizationId: orgId,
      lifecycleStage: { not: "CHURNED" },
      clientHubLifecycle: {
        enabled: true,
      },
      OR: [
        { email: null },
        { email: "" },
      ],
    },
  });

  items.push({
    id: "portal-customer-emails",
    label: "Portal customer email check",
    description: enabledWithMissingEmailCount === 0
      ? "All portal-enabled customers have a primary email address configured."
      : `${enabledWithMissingEmailCount} portal-enabled customer${enabledWithMissingEmailCount > 1 ? "s are" : " is"} missing a primary email address. They will not be able to log in until an email is set.`,
    status: enabledWithMissingEmailCount === 0 ? "pass" : "warn",
    actionHref: "/app/settings/portal/client-hub",
    actionLabel: "Manage client overrides",
  });

  return items;
}

const STATUS_ICON = {
  pass: <CheckCircle className="h-5 w-5 text-green-500" />,
  fail: <XCircle className="h-5 w-5 text-red-500" />,
  warn: <AlertCircle className="h-5 w-5 text-amber-500" />,
};

const STATUS_LABEL = {
  pass: { label: "Pass", className: "bg-green-50 text-green-700" },
  fail: { label: "Action required", className: "bg-red-50 text-red-700" },
  warn: { label: "Recommended", className: "bg-amber-50 text-amber-700" },
};

export default async function PortalReadinessPage() {
  const { orgId } = await requireRole("admin");
  const items = await buildChecklist(orgId);

  const passCount = items.filter((i) => i.status === "pass").length;
  const failCount = items.filter((i) => i.status === "fail").length;
  const warnCount = items.filter((i) => i.status === "warn").length;
  const allPassed = failCount === 0 && warnCount === 0;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Portal Readiness Checklist</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review what&apos;s needed to provide a complete, branded client portal experience.
        </p>
      </div>

      {/* Score card */}
      <div className={`rounded-xl border p-5 ${allPassed ? "border-green-200 bg-green-50" : failCount > 0 ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex items-center gap-4">
          {allPassed ? (
            <CheckCircle className="h-8 w-8 text-green-500" />
          ) : (
            <AlertCircle className={`h-8 w-8 ${failCount > 0 ? "text-red-500" : "text-amber-500"}`} />
          )}
          <div>
            <p className="font-semibold text-gray-900">
              {allPassed ? "Portal is fully configured" : `${passCount} of ${items.length} checks passed`}
            </p>
            <p className="text-sm text-gray-600">
              {failCount > 0 && `${failCount} action${failCount > 1 ? "s" : ""} required. `}
              {warnCount > 0 && `${warnCount} recommendation${warnCount > 1 ? "s" : ""}.`}
              {allPassed && "Everything looks good — your portal is ready for customers."}
            </p>
          </div>
        </div>
      </div>

      {/* Checklist */}
      <div className="space-y-3">
        {items.map((item) => {
          const badge = STATUS_LABEL[item.status];
          return (
            <div
              key={item.id}
              className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5"
            >
              <div className="mt-0.5 flex-shrink-0">{STATUS_ICON[item.status]}</div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="font-medium text-gray-900">{item.label}</p>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500">{item.description}</p>
              </div>
              {item.actionHref && item.actionLabel && (
                <Link
                  href={item.actionHref}
                  className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                >
                  {item.actionLabel}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
