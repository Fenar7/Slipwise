"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/dashboard/status-badge";
import {
  ArrowLeft,
  Receipt,
  Quote,
  Link2,
  Mail,
  Globe,
  Pencil,
} from "lucide-react";
import type { ClientDetail } from "@/app/app/data/actions";
import {
  LIFECYCLE_VARIANTS,
  PORTAL_STATUS_VARIANTS,
  PORTAL_STATUS_LABELS,
} from "./client-workspace-mock-data";

interface ClientDetailHeaderProps {
  client: ClientDetail;
}

export function ClientDetailHeader({ client }: ClientDetailHeaderProps) {
  const lifecycle = client.lifecycleStage ?? "PROSPECT";
  const lifecycleVariant = LIFECYCLE_VARIANTS[lifecycle] ?? "neutral";

  return (
    <div className="space-y-4">
      {/* Breadcrumb + back */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/app/clients"
          className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--brand-primary)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Clients
        </Link>
        <span className="text-[var(--text-muted)]">/</span>
        <span className="text-[var(--text-secondary)] font-medium truncate max-w-[200px] sm:max-w-xs">
          {client.name}
        </span>
      </div>

      {/* Main header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
              {client.name}
            </h1>
            <StatusBadge variant={lifecycleVariant}>
              {lifecycle.replace(/_/g, " ")}
            </StatusBadge>
            <StatusBadge
              variant={PORTAL_STATUS_VARIANTS[client.portalStatus] ?? "neutral"}
            >
              {PORTAL_STATUS_LABELS[client.portalStatus] ?? client.portalStatus}
            </StatusBadge>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              {client.email}
            </span>
            {client.city || client.state ? (
              <span className="inline-flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" />
                {[client.city, client.state].filter(Boolean).join(", ")}
              </span>
            ) : client.address ? (
              <span className="inline-flex items-center gap-1.5" title={client.address}>
                <Globe className="h-3.5 w-3.5" />
                {client.address.split("\n")[0]}
              </span>
            ) : null}
            {client.assignedTo && (
              <span>Assigned to {client.assignedTo}</span>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Link
            href={`/app/docs/invoices/new?customerId=${client.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand-cta)] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#B91C1C] shadow-[0_1px_3px_rgba(220,38,38,0.25)]"
          >
            <Receipt className="h-3.5 w-3.5" />
            Invoice
          </Link>
          <Link
            href={`/app/docs/quotes/new?customerId=${client.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
          >
            <Quote className="h-3.5 w-3.5" />
            Quote
          </Link>
          <Link
            href={`/app/clients/${client.id}/edit`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Link>
        </div>
      </div>
    </div>
  );
}
