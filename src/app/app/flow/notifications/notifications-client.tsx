"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationRead, markAllRead } from "./actions";
import {
  Paperclip,
  CheckCircle2,
  XCircle,
  Ticket,
  MessageSquare,
  Hand,
  AlertTriangle,
  Bell,
  CheckCheck,
  ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ─── Notification Type Config ────────────────────────────────────────────────

interface TypeConfig {
  Icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  accentColor: string;
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  proof_uploaded: {
    Icon: Paperclip,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    accentColor: "bg-blue-500",
  },
  proof_accepted: {
    Icon: CheckCircle2,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    accentColor: "bg-emerald-500",
  },
  proof_rejected: {
    Icon: XCircle,
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
    accentColor: "bg-red-500",
  },
  ticket_opened: {
    Icon: Ticket,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    accentColor: "bg-violet-500",
  },
  ticket_reply: {
    Icon: MessageSquare,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    accentColor: "bg-violet-500",
  },
  approval_requested: {
    Icon: Hand,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    accentColor: "bg-amber-500",
  },
  approval_approved: {
    Icon: CheckCircle2,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    accentColor: "bg-emerald-500",
  },
  approval_rejected: {
    Icon: XCircle,
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
    accentColor: "bg-red-500",
  },
  invoice_overdue: {
    Icon: AlertTriangle,
    iconBg: "bg-orange-50",
    iconColor: "text-orange-600",
    accentColor: "bg-orange-500",
  },
};

const DEFAULT_CONFIG: TypeConfig = {
  Icon: Bell,
  iconBg: "bg-[var(--surface-subtle)]",
  iconColor: "text-[var(--text-muted)]",
  accentColor: "bg-[var(--brand-primary)]",
};

function getTypeConfig(type: string): TypeConfig {
  return TYPE_CONFIG[type] ?? DEFAULT_CONFIG;
}

// ─── Relative Time ────────────────────────────────────────────────────────────

function relativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ─── Mark All Read Button ─────────────────────────────────────────────────────

export function MarkAllReadButton({ hasUnread }: { hasUnread: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!hasUnread) return null;

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await markAllRead();
          router.refresh();
        })
      }
      disabled={isPending}
      className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-primary)] px-3.5 py-2 text-sm font-medium text-[var(--text-secondary)] shadow-sm transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <CheckCheck className="h-4 w-4" />
      {isPending ? "Marking…" : "Mark all read"}
    </button>
  );
}

// ─── Notification Item ────────────────────────────────────────────────────────

interface NotificationItemProps {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: Date;
}

export function NotificationItem({
  id,
  type,
  title,
  body,
  link,
  isRead,
  createdAt,
}: NotificationItemProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { Icon, iconBg, iconColor, accentColor } = getTypeConfig(type);

  function handleClick() {
    startTransition(async () => {
      if (!isRead) {
        await markNotificationRead(id);
      }
      if (link) {
        router.push(link);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className={`group relative flex w-full items-start gap-4 px-5 py-4 text-left transition-colors ${
        isRead
          ? "bg-[var(--surface-primary)] hover:bg-[var(--surface-hover)]"
          : "bg-blue-50/40 hover:bg-blue-50/70"
      } ${isPending ? "opacity-60" : ""}`}
    >
      {/* Unread accent bar */}
      {!isRead && (
        <span
          className={`absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full ${accentColor}`}
        />
      )}

      {/* Icon */}
      <div
        className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${iconBg}`}
      >
        <Icon className={`h-4.5 w-4.5 ${iconColor}`} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p
            className={`text-sm leading-snug ${
              isRead
                ? "font-normal text-[var(--text-secondary)]"
                : "font-semibold text-[var(--text-primary)]"
            }`}
          >
            {title}
          </p>
          <div className="flex flex-shrink-0 items-center gap-2">
            <span className="whitespace-nowrap text-xs text-[var(--text-muted)]">
              {relativeTime(createdAt)}
            </span>
            {!isRead && (
              <span className={`h-2 w-2 flex-shrink-0 rounded-full ${accentColor}`} />
            )}
          </div>
        </div>
        <p className="mt-0.5 text-sm text-[var(--text-muted)] line-clamp-2">
          {body}
        </p>
        {link && (
          <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-[var(--brand-primary)] opacity-0 transition-opacity group-hover:opacity-100">
            View details
            <ArrowRight className="h-3 w-3" />
          </span>
        )}
      </div>
    </button>
  );
}
