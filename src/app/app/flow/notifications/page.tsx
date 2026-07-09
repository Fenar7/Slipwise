import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CheckCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { listNotifications } from "./actions";
import { MarkAllReadButton, NotificationItem } from "./notifications-client";

export const metadata: Metadata = { title: "Notifications | Slipwise" };

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function NotificationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "0", 10);

  const result = await listNotifications({ page });

  if (!result.success) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--state-danger-soft)] p-6 text-center">
          <p className="text-sm font-medium text-[var(--state-danger)]">
            Error loading notifications: {result.error}
          </p>
        </div>
      </div>
    );
  }

  const { notifications, total, unreadCount } = result.data;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-primary)] text-white shadow-sm">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
              Notifications
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
                : "You're all caught up"}
            </p>
          </div>
        </div>
        <MarkAllReadButton hasUnread={unreadCount > 0} />
      </div>

      {/* Stats Bar */}
      {total > 0 && (
        <div className="flex items-center gap-6 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-subtle)] px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--brand-primary)]" />
            <span className="text-xs font-medium text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text-primary)]">{unreadCount}</span> unread
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--border-soft)]" />
            <span className="text-xs font-medium text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text-primary)]">{total - unreadCount}</span> read
            </span>
          </div>
          <div className="ml-auto text-xs text-[var(--text-muted)]">
            {total} total
          </div>
        </div>
      )}

      {/* Notification List */}
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-subtle)] py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--surface-primary)]">
            <Bell className="h-6 w-6 text-[var(--text-muted)]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              No notifications yet
            </h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              You&apos;ll be notified here when there are updates.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-primary)] shadow-sm divide-y divide-[var(--border-soft)]">
          {notifications.map((n) => (
            <NotificationItem
              key={n.id}
              id={n.id}
              type={n.type}
              title={n.title}
              body={n.body}
              link={n.link}
              isRead={n.isRead}
              createdAt={n.createdAt}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-[var(--border-soft)] bg-[var(--surface-subtle)] px-5 py-3">
          <p className="text-sm text-[var(--text-muted)]">
            Page <span className="font-semibold text-[var(--text-primary)]">{page + 1}</span> of{" "}
            <span className="font-semibold text-[var(--text-primary)]">{totalPages}</span>
          </p>
          <div className="flex gap-2">
            {page > 0 ? (
              <Link
                href={`/app/flow/notifications?page=${page - 1}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-primary)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-sm font-medium text-[var(--text-muted)] opacity-40 cursor-not-allowed">
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </span>
            )}
            {page < totalPages - 1 ? (
              <Link
                href={`/app/flow/notifications?page=${page + 1}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-primary)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-sm font-medium text-[var(--text-muted)] opacity-40 cursor-not-allowed">
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
