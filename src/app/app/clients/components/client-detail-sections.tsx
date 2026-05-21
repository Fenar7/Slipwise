import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/dashboard/status-badge";
import Link from "next/link";
import {
  Receipt,
  Quote,
  FileText,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Globe,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Pencil,
} from "lucide-react";
import type { ClientDetail, ClientDocumentSummary, ClientActivity } from "@/app/app/data/actions";

type DetailTab = "overview" | "documents" | "contacts" | "billing" | "portal" | "activity";

interface ClientDetailSectionsProps {
  client: ClientDetail;
  activeTab: DetailTab;
}

function formatCurrency(amount: number) {
  if (amount === 0) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const INVOICE_STATUS_VARIANTS: Record<string, Parameters<typeof StatusBadge>[0]["variant"]> = {
  DRAFT: "neutral",
  ISSUED: "info",
  VIEWED: "info",
  DUE: "warning",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  OVERDUE: "danger",
  DISPUTED: "danger",
  CANCELLED: "neutral",
};

const QUOTE_STATUS_VARIANTS: Record<string, Parameters<typeof StatusBadge>[0]["variant"]> = {
  DRAFT: "neutral",
  SENT: "info",
  ACCEPTED: "success",
  DECLINED: "danger",
  EXPIRED: "warning",
  CONVERTED: "success",
};

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  invoice: Receipt,
  quote: Quote,
  payment: CreditCard,
  note: FileText,
  portal: Globe,
  lifecycle: CheckCircle2,
};

export function ClientDetailSections({ client, activeTab }: ClientDetailSectionsProps) {
  switch (activeTab) {
    case "overview":
      return <OverviewSection client={client} />;
    case "documents":
      return <DocumentsSection client={client} />;
    case "contacts":
      return <ContactsSection client={client} />;
    case "billing":
      return <BillingSection client={client} />;
    case "portal":
      return <PortalSection client={client} />;
    case "activity":
      return <ActivitySection client={client} />;
    default:
      return null;
  }
}

function SectionCard({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("slipwise-panel space-y-3", className)}>
      {title && (
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)]">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

function OverviewSection({ client }: { client: ClientDetail }) {
  return (
    <div className="space-y-4">
      {/* Client Hub Readiness Card */}
      <div className="slipwise-panel border border-[var(--border-default)] p-5 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)]">
              Client Hub Operational Readiness
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-[var(--text-primary)]">
                {client.readiness.isReady ? "Fully Provision Ready" : "Requires Attention / Action"}
              </span>
              <span className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                client.readiness.isReady 
                  ? "bg-[var(--state-success-soft)] text-[var(--state-success)]" 
                  : "bg-[var(--state-warning-soft)] text-[var(--state-warning)]"
              )}>
                {client.readiness.isReady ? "Eligible" : "Ineligible"}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)] block">Readiness Score</span>
              <span className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{client.readiness.score}%</span>
            </div>
            {/* Circular or linear progress */}
            <div className="h-10 w-24 bg-[var(--surface-subtle)] rounded-full overflow-hidden relative border border-[var(--border-soft)]">
              <div 
                className={cn(
                  "h-full transition-all duration-500",
                  client.readiness.isReady ? "bg-[var(--state-success)]" : "bg-[var(--state-warning)]"
                )}
                style={{ width: `${client.readiness.score}%` }}
              />
            </div>
          </div>
        </div>

        {/* Blockers & Warnings Grid */}
        {(client.readiness.blockers.length > 0 || client.readiness.warnings.length > 0) ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 pt-3 border-t border-[var(--border-soft)]">
            {client.readiness.blockers.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 animate-pulse" />
                  Critical Blockers ({client.readiness.blockers.length})
                </h4>
                <ul className="space-y-1.5">
                  {client.readiness.blockers.map((blocker, i) => (
                    <li key={i} className="text-xs text-[var(--text-secondary)] bg-red-50/50 border border-red-100 rounded-lg p-2 flex items-start gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0 mt-1.5" />
                      {blocker}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {client.readiness.warnings.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1">
                  <Info className="h-3.5 w-3.5" />
                  Operational Warnings ({client.readiness.warnings.length})
                </h4>
                <ul className="space-y-1.5">
                  {client.readiness.warnings.map((warning, i) => (
                    <li key={i} className="text-xs text-[var(--text-secondary)] bg-amber-50/30 border border-amber-100 rounded-lg p-2 flex items-start gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-emerald-50/30 border border-emerald-100/50 rounded-xl p-3.5 flex items-center gap-3 text-xs text-[var(--text-secondary)]">
            <CheckCircle2 className="h-5 w-5 text-[var(--state-success)] shrink-0" />
            <div className="space-y-0.5">
              <p className="font-semibold text-emerald-950">Perfect Health & Compatibility</p>
              <p className="text-emerald-800">This profile is fully verified, tax-compliant, and eligible for seamless client portal operations.</p>
            </div>
          </div>
        )}

        {!client.readiness.isReady && (
          <div className="flex justify-end pt-1">
            <Link 
              href={`/app/clients/${client.id}/edit`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-primary)] hover:underline"
            >
              <Pencil className="h-3 w-3" />
              Resolve Readiness Requirements
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Recent Invoices">
          {client.recentInvoices.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No recent invoices.</p>
          ) : (
            <div className="divide-y divide-[var(--border-soft)]">
              {client.recentInvoices.map((inv) => (
                <DocumentRow key={inv.id} doc={inv} type="invoice" />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Recent Quotes">
          {client.recentQuotes.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No recent quotes.</p>
          ) : (
            <div className="divide-y divide-[var(--border-soft)]">
              {client.recentQuotes.map((q) => (
                <DocumentRow key={q.id} doc={q} type="quote" />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Primary Contact">
        {client.contacts.filter((c) => c.isPrimary).map((contact) => (
          <div key={contact.id} className="flex flex-col gap-1">
            <p className="text-sm font-medium text-[var(--text-primary)]">{contact.name}</p>
            <p className="text-xs text-[var(--text-muted)]">{contact.role}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3 w-3 text-[var(--text-muted)]" />
                {contact.email}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3 w-3 text-[var(--text-muted)]" />
                {contact.phone}
              </span>
            </div>
          </div>
        ))}
      </SectionCard>

      <SectionCard title="Address">
        <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
          <MapPin className="h-4 w-4 shrink-0 text-[var(--text-muted)] mt-0.5" />
          <div>
            {client.address && <p>{client.address}</p>}
            {(client.city || client.state || client.postalCode) && (
              <p>
                {[client.city, client.state].filter(Boolean).join(", ")}
                {client.postalCode ? ` ${client.postalCode}` : ""}
              </p>
            )}
            {client.country && <p>{client.country}</p>}
            {!client.address && !client.city && !client.state && !client.country && (
              <p className="text-[var(--text-muted)]">No address configured.</p>
            )}
          </div>
        </div>
      </SectionCard>

      {client.notes && (
        <SectionCard title="Internal Notes">
          <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{client.notes}</p>
        </SectionCard>
      )}
    </div>
  );
}

function DocumentsSection({ client }: { client: ClientDetail }) {
  return (
    <div className="space-y-4">
      <SectionCard title="Invoices">
        {client.recentInvoices.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No invoices yet.</p>
        ) : (
          <div className="divide-y divide-[var(--border-soft)]">
            {client.recentInvoices.map((inv) => (
              <DocumentRow key={inv.id} doc={inv} type="invoice" />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Quotes">
        {client.recentQuotes.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No quotes yet.</p>
        ) : (
          <div className="divide-y divide-[var(--border-soft)]">
            {client.recentQuotes.map((q) => (
              <DocumentRow key={q.id} doc={q} type="quote" />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function DocumentRow({ doc, type }: { doc: ClientDocumentSummary; type: "invoice" | "quote" }) {
  const statusVariants = type === "invoice" ? INVOICE_STATUS_VARIANTS : QUOTE_STATUS_VARIANTS;
  const variant = statusVariants[doc.status] ?? "neutral";

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-subtle)] text-[var(--text-muted)]">
          {type === "invoice" ? <Receipt className="h-4 w-4" /> : <Quote className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)] truncate">{doc.number}</p>
          <p className="text-xs text-[var(--text-muted)]">{formatDate(doc.date)}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <StatusBadge variant={variant}>{doc.status.replace(/_/g, " ")}</StatusBadge>
        <span className="text-sm font-medium tabular-nums text-[var(--text-primary)]">
          {formatCurrency(doc.amount)}
        </span>
      </div>
    </div>
  );
}

function ContactsSection({ client }: { client: ClientDetail }) {
  const hasEmail = !!client.email;
  const hasPhone = !!client.phone;

  return (
    <div className="space-y-4">
      {(!hasEmail || !hasPhone) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 text-xs text-[var(--text-secondary)] space-y-2">
          <div className="flex items-center gap-2 font-semibold text-amber-950">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Operational Profile Incomplete
          </div>
          <div className="space-y-1">
            {!hasEmail && (
              <p>• <span className="font-medium text-amber-900">Email Missing:</span> Client Hub access cannot be provisioned or activated without a valid primary contact email address.</p>
            )}
            {!hasPhone && (
              <p>• <span className="font-medium text-amber-900">Phone Missing:</span> Direct phone communication pathway is missing on the client record.</p>
            )}
          </div>
          <div className="pt-1">
            <Link 
              href={`/app/clients/${client.id}/edit`}
              className="inline-flex items-center gap-1 text-[var(--brand-primary)] font-semibold hover:underline"
            >
              <Pencil className="h-3 w-3" />
              Configure Contact Details
            </Link>
          </div>
        </div>
      )}

      <SectionCard title="All Contacts">
        {client.contacts.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-[var(--text-muted)]">No primary contact configured.</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">Configure an email address in client settings to assign a primary contact.</p>
            <Link 
              href={`/app/clients/${client.id}/edit`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Add Contact Info
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-soft)]">
            {client.contacts.map((contact) => (
              <div key={contact.id} className="flex items-start justify-between py-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{contact.name}</p>
                    {contact.isPrimary && (
                      <span className="inline-flex items-center rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Primary
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">{contact.role}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="h-3 w-3 text-[var(--text-muted)]" />
                      {contact.email}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="h-3 w-3 text-[var(--text-muted)]" />
                      {contact.phone}
                    </span>
                  </div>
                </div>
                
                <Link 
                  href={`/app/clients/${client.id}/edit`}
                  className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--brand-primary)] hover:bg-[var(--surface-subtle)] transition-colors"
                  title="Edit Contact"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function BillingSection({ client }: { client: ClientDetail }) {
  const hasAddress = !!client.address;
  const hasGstin = !!client.gstin;
  const hasPan = !!client.panNumber;

  return (
    <div className="space-y-4">
      {(!hasAddress || !hasGstin || !hasPan) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 text-xs text-[var(--text-secondary)] space-y-2">
          <div className="flex items-center gap-2 font-semibold text-amber-950">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Billing & Tax Information Incomplete
          </div>
          <div className="space-y-1">
            {!hasAddress && (
              <p>• <span className="font-medium text-amber-900">Billing Address Missing:</span> A valid physical address is mandatory to generate legally compliant tax invoices.</p>
            )}
            {!hasGstin && (
              <p>• <span className="font-medium text-amber-900">GSTIN Missing:</span> B2B compliance fields are absent. Standard B2C treatment will be applied to generated documents.</p>
            )}
            {!hasPan && (
              <p>• <span className="font-medium text-amber-900">PAN / Tax ID Missing:</span> Essential legal tax registration details are missing. Higher withholding taxes (TDS) may be applicable.</p>
            )}
          </div>
          <div className="pt-1">
            <Link 
              href={`/app/clients/${client.id}/edit`}
              className="inline-flex items-center gap-1 text-[var(--brand-primary)] font-semibold hover:underline"
            >
              <Pencil className="h-3 w-3" />
              Configure Billing & Tax Settings
            </Link>
          </div>
        </div>
      )}

      <SectionCard title="Billing Address">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
            <MapPin className="h-4 w-4 shrink-0 text-[var(--text-muted)] mt-0.5" />
            <div>
              {client.billingAddress ? (
                <p className="whitespace-pre-wrap">{client.billingAddress}</p>
              ) : (
                <p className="italic text-[var(--text-muted)]">No billing address configured on file.</p>
              )}
            </div>
          </div>
          <Link 
            href={`/app/clients/${client.id}/edit`}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--brand-primary)] hover:bg-[var(--surface-subtle)] transition-colors"
            title="Edit Address"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Link>
        </div>
      </SectionCard>

      <SectionCard title="Tax Information">
        <div className="flex justify-between items-start">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 flex-1">
            <div className="space-y-0.5">
              <dt className="text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                GSTIN
              </dt>
              <dd className={cn(
                "text-sm font-medium",
                client.gstin ? "text-[var(--text-primary)]" : "italic text-[var(--text-muted)]"
              )}>
                {client.gstin || "Not configured"}
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                PAN / Permanent Account Number
              </dt>
              <dd className={cn(
                "text-sm font-medium",
                client.panNumber ? "text-[var(--text-primary)] animate-in fade-in" : "italic text-[var(--text-muted)]"
              )}>
                {client.panNumber || "Not configured (PAN derived from GSTIN)"}
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Alternative Tax ID
              </dt>
              <dd className={cn(
                "text-sm font-medium",
                client.taxId ? "text-[var(--text-primary)]" : "italic text-[var(--text-muted)]"
              )}>
                {client.taxId || "Not configured"}
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Preferred Language
              </dt>
              <dd className="text-sm font-medium text-[var(--text-primary)]">
                {client.preferredLanguage === "en" ? "English (en)" : client.preferredLanguage || "en"}
              </dd>
            </div>
          </dl>
          
          <Link 
            href={`/app/clients/${client.id}/edit`}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--brand-primary)] hover:bg-[var(--surface-subtle)] transition-colors shrink-0"
            title="Edit Tax Details"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Link>
        </div>
      </SectionCard>
    </div>
  );
}

function PortalSection({ client }: { client: ClientDetail }) {
  return (
    <div className="space-y-4">
      <SectionCard title="Client Hub Status">
        <div className="flex items-center gap-3">
          {client.portalEnabled ? (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--state-success-soft)] text-[var(--state-success)]">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Client Hub Enabled</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Last accessed {client.portalLastAccessedAt ? formatDateTime(client.portalLastAccessedAt) : "—"}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[var(--text-muted)]">
                <XCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Client Hub Disabled</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Enable to let this client access their documents and balances.
                </p>
              </div>
            </>
          )}
        </div>
      </SectionCard>

      {!client.portalEnabled && client.readiness.blockers.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50/30 p-4 text-xs text-[var(--text-secondary)] space-y-2 animate-in fade-in duration-300">
          <p className="font-semibold text-red-950 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            Client Hub Provisioning Blocked
          </p>
          <p>This client cannot be enabled or invited to the Client Hub because of the following profile compliance issues:</p>
          <ul className="space-y-1 pl-1 list-disc list-inside">
            {client.readiness.blockers.map((blocker, i) => (
              <li key={i} className="text-red-900">{blocker}</li>
            ))}
          </ul>
          <div className="pt-1">
            <Link 
              href={`/app/clients/${client.id}/edit`}
              className="inline-flex items-center gap-1 text-[var(--brand-primary)] font-semibold hover:underline"
            >
              <Pencil className="h-3 w-3" />
              Configure Client Profile to Resolve
            </Link>
          </div>
        </div>
      )}

      {client.portalEnabled && (
        <SectionCard title="Access Statistics">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Total Accesses
              </p>
              <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                {client.portalAccessCount}
              </p>
            </div>
            <div>
              <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Last Accessed
              </p>
              <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                {client.portalLastAccessedAt ? formatDateTime(client.portalLastAccessedAt) : "—"}
              </p>
            </div>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Client Hub Access Information">
        <div className="text-sm text-[var(--text-secondary)] space-y-3 leading-relaxed">
          <p>
            {client.portalEnabled
              ? "The Client Hub is fully enabled for this client. They can log in securely to view their financial documents, outstanding balances, and recent activities using their active portal credentials."
              : client.portalStatus === "ineligible"
              ? "This client profile is ineligible for Client Hub access. To enable portal access, please ensure the client profile is updated with a valid email address."
              : "Client Hub access is currently inactive for this profile. Provisioning controls are managed through system administrator actions once portal setups are configured."}
          </p>
          <div className="rounded-lg bg-[var(--surface-subtle)] p-3 border border-[var(--border-soft)] text-xs space-y-1.5 text-[var(--text-secondary)]">
            <p className="font-semibold uppercase tracking-wider text-[var(--text-muted)] text-[0.65rem] mb-1.5">
              Portal Credentials
            </p>
            <p>
              <span className="font-medium text-[var(--text-primary)]">Username / Email:</span>{" "}
              {client.email || <span className="italic text-[var(--text-muted)]">None configured</span>}
            </p>
            <p>
              <span className="font-medium text-[var(--text-primary)]">Access Type:</span>{" "}
              {client.portalEnabled ? "Secure Token-based Link" : "None"}
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function ActivitySection({ client }: { client: ClientDetail }) {
  return (
    <div className="space-y-4">
      <SectionCard title="Recent Activity">
        {client.recentActivity.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No activity recorded.</p>
        ) : (
          <div className="relative space-y-0">
            {/* Timeline line */}
            <div className="absolute left-3.5 top-0 bottom-0 w-px bg-[var(--border-soft)]" />
            {client.recentActivity.map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function ActivityItem({ activity }: { activity: ClientActivity }) {
  const Icon = ACTIVITY_ICONS[activity.type] ?? FileText;

  return (
    <div className="relative flex gap-3 py-3 pl-1">
      {/* Timeline dot */}
      <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] border border-[var(--border-soft)]">
        <Icon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm text-[var(--text-primary)]">{activity.description}</p>
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDateTime(activity.date)}
          </span>
          {activity.actor && <span>by {activity.actor}</span>}
        </div>
      </div>
    </div>
  );
}
