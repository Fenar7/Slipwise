import type { Metadata } from "next";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { listPortalConversations, type PortalConversationItem } from "./actions";

export const metadata: Metadata = {
  title: "Messages | Customer Portal",
};

interface PageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function PortalMessagesPage({ params }: PageProps) {
  const { orgSlug } = await params;

  const result = await listPortalConversations(orgSlug);

  if (!result.success) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-red-700">
        <h2 className="font-semibold">Unable to load messages</h2>
        <p className="mt-1 text-sm">{result.error}</p>
      </div>
    );
  }

  const { conversations } = result.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Messages</h1>
          <p className="mt-1 text-sm text-slate-500">
            Communicate directly with our team regarding your account, invoices, or quotes.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {conversations.length === 0 ? (
          <div className="p-16 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50">
              <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900">No conversations yet</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
              There are no messages in your inbox. When a team member starts a conversation with you or shares an update, it will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {conversations.map((conv) => (
              <Link
                key={conv.id}
                href={`/portal/${orgSlug}/client-hub/messages/${conv.id}`}
                className="group flex flex-col gap-3 p-5 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {conv.linkedRecordType ? `${conv.linkedRecordType.replace("_", " ")} Discussion` : "General Conversation"}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-xs text-slate-500">
                      ID: {conv.id.slice(0, 8)}
                    </span>
                  </div>

                  <h4 className="truncate text-base font-semibold text-slate-900 group-hover:text-blue-600 flex items-center gap-2">
                    {conv.linkedRecordType ? `${conv.linkedRecordType.replace("_", " ")} Discussion` : "Conversation with Support"}
                    {conv.unreadCount > 0 && (
                      <span className="inline-flex h-2.5 w-2.5 rounded-full portal-accent-bg" aria-label="Unread messages" />
                    )}
                  </h4>

                  <p className="truncate text-sm text-slate-600 italic">
                    {conv.lastMessageSnippet || "No messages yet"}
                  </p>

                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    {conv.lastMessageAt && (
                      <span>
                        Last active {formatRelativeTime(conv.lastMessageAt)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={conv.portalState} />
                    {conv.unreadCount > 0 && (
                      <span className="portal-accent-bg inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white">
                        {conv.unreadCount} unread
                      </span>
                    )}
                  </div>
                  <svg className="hidden h-5 w-5 text-slate-300 sm:block transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    OPEN: "bg-emerald-50 text-emerald-700 border-emerald-100",
    WAITING_ON_INTERNAL: "bg-blue-50 text-blue-700 border-blue-100",
    WAITING_ON_CLIENT: "bg-amber-50 text-amber-700 border-amber-100",
    CLOSED: "bg-slate-50 text-slate-500 border-slate-200",
  };

  const labels: Record<string, string> = {
    OPEN: "Active",
    WAITING_ON_INTERNAL: "Under Review",
    WAITING_ON_CLIENT: "Action Required",
    CLOSED: "Closed",
  };

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[status] ?? "bg-slate-50 text-slate-600 border-slate-200"}`}>
      {labels[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}
