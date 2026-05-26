import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Receipt,
  Quote,
  FileText,
  Globe,
  Link2,
  Mail,
  Phone,
  MapPin,
  Calendar,
  User,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import type { ClientDetail } from "@/app/app/data/actions";

interface ClientDetailRailProps {
  client: ClientDetail;
}

function RailCard({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
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

function MetadataItem({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: React.ElementType }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />}
        <span className="break-words">{value}</span>
      </dd>
    </div>
  );
}

export function ClientDetailRail({ client }: ClientDetailRailProps) {
  return (
    <div className="space-y-4">
      {/* Portal readiness card */}
      <RailCard title="Hub Readiness">
        <div className="flex items-center gap-3">
          {client.readiness.isReady ? (
            <>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--state-success-soft)] text-[var(--state-success)]">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Hub Ready</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {client.readiness.score}% score • No blockers
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 border border-red-100">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Incomplete Profile</p>
                <p className="text-xs text-red-600 font-medium animate-pulse">
                  {client.readiness.blockers.length} critical blocker{client.readiness.blockers.length > 1 ? "s" : ""}
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border-soft)]">
          <p className="text-[0.725rem] text-[var(--text-secondary)] leading-relaxed bg-[var(--surface-subtle)] p-2.5 rounded-lg border border-[var(--border-soft)]">
            {client.readiness.isReady
              ? "All critical contact, billing, and compliance fields are successfully verified. Profile is fully eligible for portal provisioning."
              : `This client profile cannot be provisioned due to profile incomplete state. Please click below to resolve all active blockers.`}
          </p>
          {!client.readiness.isReady && (
            <Link 
              href={`/app/clients/${client.id}/edit`}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
            >
              Configure Details
            </Link>
          )}
        </div>
      </RailCard>

      {/* Quick actions */}
      <RailCard title="Quick Actions">
        <div className="flex flex-col gap-2">
          <Link
            href={`/app/docs/invoices/new?customerId=${client.id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
          >
            <Receipt className="h-3.5 w-3.5" />
            New Invoice
          </Link>
          <Link
            href={`/app/docs/quotes/new?customerId=${client.id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
          >
            <Quote className="h-3.5 w-3.5" />
            New Quote
          </Link>
          <Link
            href={`/app/clients/${client.id}/edit`}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
          >
            <FileText className="h-3.5 w-3.5" />
            Edit Client
          </Link>
        </div>
      </RailCard>

      {/* Contact info */}
      <RailCard title="Contact">
        <dl className="space-y-3">
          <MetadataItem label="Email" value={client.email} icon={Mail} />
          <MetadataItem label="Phone" value={client.phone} icon={Phone} />
          <MetadataItem
            label="Address"
            value={
              client.city || client.state
                ? [client.city, client.state].filter(Boolean).join(", ")
                : client.address
                ? client.address.split("\n")[0]
                : "—"
            }
            icon={MapPin}
          />
        </dl>
      </RailCard>

      {/* Metadata */}
      <RailCard title="Details">
        <dl className="space-y-3">
          <MetadataItem label="GSTIN" value={client.gstin || "—"} />
          <MetadataItem label="PAN" value={client.panNumber || "—"} />
          <MetadataItem
            label="Created"
            value={new Date(client.createdAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            icon={Calendar}
          />
          <MetadataItem label="Assigned To" value={client.assignedTo || "—"} icon={User} />
        </dl>
      </RailCard>

      {/* Tags */}
      {client.tags.length > 0 && (
        <RailCard title="Tags">
          <div className="flex flex-wrap gap-1.5">
            {client.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-md bg-[var(--surface-subtle)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </RailCard>
      )}
    </div>
  );
}
