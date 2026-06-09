import { notFound } from "next/navigation";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/format-relative-time";
import {
  getPortalConversationDetail,
  markPortalConversationAsRead,
} from "../actions";
import { PortalMessageReplyBox } from "./reply-box";
import { PortalAttachmentItem } from "./attachment-item";

interface PageProps {
  params: Promise<{ orgSlug: string; conversationId: string }>;
}

export default async function PortalConversationDetailPage({ params }: PageProps) {
  const { orgSlug, conversationId } = await params;

  // Mark conversation as read on entry durably in DB
  await markPortalConversationAsRead(orgSlug, conversationId);

  // Retrieve details
  const result = await getPortalConversationDetail(orgSlug, conversationId);

  // Fail closed: if unauthorized, eligibility check fails, or conversation doesn't exist, return notFound() to prevent ID existence leak.
  if (!result.success || !result.data) {
    notFound();
  }

  const conversation = result.data;

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      {/* Breadcrumbs / Back */}
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <Link href={`/portal/${orgSlug}/client-hub/messages`} className="hover:text-slate-900 transition-colors">
          Messages
        </Link>
        <svg className="h-4 w-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="truncate text-slate-900 font-medium">Discussion</span>
      </nav>

      {/* Header Info */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {conversation.linkedRecordType ? `${conversation.linkedRecordType.replace("_", " ")} Discussion` : "Support Thread"}
              </span>
              <StatusBadge status={conversation.portalState} />
            </div>

            <h1 className="mt-2 text-xl font-bold text-slate-900">
              {conversation.linkedRecordLabel || "Conversation with Support"}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                ID: {conversation.id}
              </span>
              {conversation.linkedRecordType === "INVOICE" && conversation.linkedRecordId && (
                <span className="flex items-center gap-1.5">
                  <span className="text-slate-300">•</span>
                  <Link href={`/portal/${orgSlug}/invoices/${conversation.linkedRecordId}`} className="text-blue-600 hover:underline">
                    View Invoice
                  </Link>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Message Timeline */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Message History</h2>

        {conversation.messages.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 text-sm shadow-sm">
            No messages in this conversation yet.
          </div>
        ) : (
          <div className="space-y-6">
            {conversation.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col gap-1.5 ${
                  msg.isFromClient ? "items-end" : "items-start"
                }`}
              >
                <div className="flex items-center gap-2 px-1 text-[11px] font-semibold text-slate-400 tracking-wide">
                  <span>{msg.authorName}</span>
                  <span>•</span>
                  <span>{formatRelativeTime(msg.createdAt)}</span>
                </div>

                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                    msg.isFromClient
                      ? "portal-accent-bg text-white"
                      : "bg-white border border-slate-200 text-slate-900"
                  }`}
                >
                  {msg.body && (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {msg.body}
                    </p>
                  )}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div
                      className={`space-y-2 ${
                        msg.body
                          ? `mt-3 border-t border-dashed pt-2.5 ${
                              msg.isFromClient ? "border-white/20" : "border-slate-200"
                            }`
                          : ""
                      }`}
                    >
                      {msg.attachments.map((att) => (
                        <PortalAttachmentItem
                          key={att.id}
                          attachmentId={att.id}
                          fileName={att.fileName}
                          sizeBytes={att.sizeBytes}
                          scanStatus={att.scanStatus}
                          orgSlug={orgSlug}
                          isFromClient={msg.isFromClient}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reply Section */}
      {conversation.portalState !== "CLOSED" ? (
        <PortalMessageReplyBox conversationId={conversationId} orgSlug={orgSlug} />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            This conversation is closed. You cannot reply to it anymore.
          </p>
        </div>
      )}
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
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ${styles[status] ?? "bg-slate-50 text-slate-600 border-slate-200"}`}>
      {labels[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}
