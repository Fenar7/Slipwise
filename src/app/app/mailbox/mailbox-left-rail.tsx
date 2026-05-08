"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Inbox,
  Circle,
  UserCheck,
  UserX,
  Flag,
  Clock,
  Send,
  FileEdit,
  Archive,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Settings,
  AlertTriangle,
  RefreshCw,
  Plus,
} from "lucide-react";
import type { MailboxConnection, MailboxGroup, MailboxTreeItem } from "./types";
import { GLOBAL_SMART_VIEWS, MOCK_MAILBOX_GROUPS } from "./mock-data";

const ICON_MAP: Record<string, React.ElementType> = {
  Inbox,
  Circle,
  UserCheck,
  UserX,
  Flag,
  Clock,
  Send,
  FileEdit,
  Archive,
  ShieldAlert,
};

function UnreadBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span
      className="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums"
      style={{
        background: "rgba(220,38,38,0.10)",
        color: "#DC2626",
        minWidth: 18,
        textAlign: "center",
      }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function HealthBadge({ status }: { status: MailboxConnection["status"] }) {
  if (status === "connected") return null;
  if (status === "reconnect_required") {
    return (
      <span title="Reconnect required" className="ml-1 shrink-0">
        <AlertTriangle className="h-3 w-3 text-amber-500" />
      </span>
    );
  }
  if (status === "degraded") {
    return (
      <span title="Sync degraded" className="ml-1 shrink-0">
        <RefreshCw className="h-3 w-3 text-amber-400" />
      </span>
    );
  }
  return null;
}

function NavItem({ item, depth = 0 }: { item: MailboxTreeItem; depth?: number }) {
  const pathname = usePathname();
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon ? ICON_MAP[item.icon] : null;

  return (
    <li>
      <Link
        href={item.href}
        className={cn(
          "group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
          depth > 0 && "pl-4",
          isActive
            ? "bg-red-50 font-semibold text-[#DC2626]"
            : "font-medium text-[#334155] hover:bg-[#F1F3F7] hover:text-[#0F172A]"
        )}
      >
        {Icon && (
          <Icon
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              isActive ? "text-[#DC2626]" : "text-[#64748B] group-hover:text-[#DC2626]"
            )}
          />
        )}
        <span className="flex-1 truncate">{item.label}</span>
        {item.unreadCount ? <UnreadBadge count={item.unreadCount} /> : null}
      </Link>
    </li>
  );
}

function MailboxAccountGroup({ group }: { group: MailboxGroup }) {
  const { connection, items } = group;
  const [expanded, setExpanded] = useState(connection.status === "connected");
  const pathname = usePathname();
  const isAnyChildActive = items.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
          isAnyChildActive
            ? "text-[#0F172A]"
            : "text-[#64748B] hover:bg-[#F1F3F7] hover:text-[#0F172A]"
        )}
      >
        {/* Account avatar */}
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
          style={{ background: connection.status === "reconnect_required" ? "#D97706" : "#16294D" }}
        >
          {connection.displayName.charAt(0).toUpperCase()}
        </span>

        <span className="flex-1 truncate text-left">{connection.displayName}</span>

        <HealthBadge status={connection.status} />

        {connection.status === "connected" && connection.unreadCount > 0 && (
          <UnreadBadge count={connection.unreadCount} />
        )}

        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-[#94A3B8]" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-[#94A3B8]" />
        )}
      </button>

      {/* Reconnect notice */}
      {connection.status === "reconnect_required" && expanded && (
        <div className="mx-2 mb-1 mt-0.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
          <p className="font-medium">Reconnect required</p>
          <p className="mt-0.5 text-amber-600">
            Token expired.{" "}
            <Link
              href="/app/settings/integrations"
              className="underline underline-offset-2 hover:text-amber-800"
            >
              Reconnect
            </Link>
          </p>
        </div>
      )}

      {expanded && connection.status === "connected" && (
        <ul className="mt-0.5 space-y-0.5 pl-2">
          {items.map((item) => (
            <NavItem key={item.id} item={item} depth={1} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function MailboxLeftRail() {
  return (
    <aside
      className="flex h-full w-56 shrink-0 flex-col overflow-hidden border-r bg-white"
      style={{ borderColor: "#E2E5EA" }}
      aria-label="Mailbox navigation"
    >
      {/* Header */}
      <div
        className="flex h-12 shrink-0 items-center justify-between border-b px-3"
        style={{ borderColor: "#E2E5EA" }}
      >
        <span className="text-sm font-bold tracking-tight" style={{ color: "#0F172A" }}>
          Mailbox
        </span>
        <button
          className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[#F1F3F7]"
          title="Compose new message"
          aria-label="Compose new message"
        >
          <Plus className="h-3.5 w-3.5" style={{ color: "#64748B" }} />
        </button>
      </div>

      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2.5" aria-label="Mailbox views">
        {/* Global smart views */}
        <div className="mb-3">
          <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#94A3B8]">
            Views
          </p>
          <ul className="space-y-0.5">
            {GLOBAL_SMART_VIEWS.map((item) => (
              <NavItem key={item.id} item={item} />
            ))}
          </ul>
        </div>

        {/* Divider */}
        <div className="my-2 border-t" style={{ borderColor: "#E2E5EA" }} />

        {/* Connected accounts */}
        <div className="space-y-2">
          <p className="px-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#94A3B8]">
            Accounts
          </p>
          {MOCK_MAILBOX_GROUPS.map((group) => (
            <MailboxAccountGroup key={group.connection.id} group={group} />
          ))}
        </div>
      </nav>

      {/* Footer: manage mailboxes */}
      <div
        className="shrink-0 border-t px-2 py-2"
        style={{ borderColor: "#E2E5EA" }}
      >
        <Link
          href="/app/settings/integrations"
          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#64748B] transition-colors hover:bg-[#F1F3F7] hover:text-[#0F172A]"
        >
          <Settings className="h-3.5 w-3.5 shrink-0" />
          Manage mailboxes
        </Link>
      </div>
    </aside>
  );
}
