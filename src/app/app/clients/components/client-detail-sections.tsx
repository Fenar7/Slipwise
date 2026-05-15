import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/dashboard/status-badge";
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
} from "lucide-react";
import type { ClientDetail, ClientDocumentSummary, ClientActivity } from "./client-detail-mock-data";

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
            <p>{client.address}</p>
            <p>{client.city}, {client.state} {client.postalCode}</p>
            <p>{client.country}</p>
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
  return (
    <div className="space-y-4">
      <SectionCard title="All Contacts">
        {client.contacts.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No contacts on file.</p>
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
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function BillingSection({ client }: { client: ClientDetail }) {
  return (
    <div className="space-y-4">
      <SectionCard title="Billing Address">
        <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
          <MapPin className="h-4 w-4 shrink-0 text-[var(--text-muted)] mt-0.5" />
          <div>
            <p>{client.billingAddress}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Tax Information">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-0.5">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              GSTIN
            </dt>
            <dd className="text-sm font-medium text-[var(--text-primary)]">{client.gstin || "—"}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              PAN
            </dt>
            <dd className="text-sm font-medium text-[var(--text-primary)]">{client.panNumber || "—"}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Tax ID
            </dt>
            <dd className="text-sm font-medium text-[var(--text-primary)]">{client.taxId || "—"}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Preferred Language
            </dt>
            <dd className="text-sm font-medium text-[var(--text-primary)]">
              {client.preferredLanguage || "—"}
            </dd>
          </div>
        </dl>
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

      <SectionCard title="Portal Actions">
        <div className="flex flex-wrap gap-2">
          <button
            disabled
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] opacity-50 cursor-not-allowed"
          >
            {client.portalEnabled ? "Disable Hub" : "Enable Hub"}
          </button>
          <button
            disabled
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] opacity-50 cursor-not-allowed"
          >
            Resend Invite
          </button>
          <button
            disabled
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] opacity-50 cursor-not-allowed"
          >
            Copy Link
          </button>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Portal actions will be wired in Sprint 1.3 / Phase 3.
        </p>
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
