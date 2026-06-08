import { notFound } from "next/navigation";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { getPortalTicketDetail } from "../actions";
import { PortalReplyBox } from "./reply-box";
import { FileIcon, Paperclip } from "lucide-react";

interface PageProps {
  params: Promise<{ orgSlug: string; ticketId: string }>;
}

export default async function PortalTicketDetailPage({ params }: PageProps) {
  const { orgSlug, ticketId } = await params;
  const ticket = await getPortalTicketDetail(ticketId, orgSlug);

  if (!ticket) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      {/* Breadcrumbs / Back */}
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <Link href={`/portal/${orgSlug}/tickets`} className="hover:text-slate-900 transition-colors">
          Support Tickets
        </Link>
        <svg className="h-4 w-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="truncate text-slate-900 font-medium">Ticket #{ticket.id.slice(-6).toUpperCase()}</span>
      </nav>

      {/* Ticket Header Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                {ticket.category.toLowerCase().replace("_", " ")}
              </span>
              <StatusBadge status={ticket.status} />
            </div>
            <h1 className="mt-2 text-xl font-bold text-slate-900">
              {ticket.description}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Invoice: <Link href={`/portal/${orgSlug}/invoices/${ticket.invoiceId}`} className="text-blue-600 hover:underline">{ticket.invoice.invoiceNumber}</Link>
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Opened {formatRelativeTime(ticket.createdAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Message Thread */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Activity</h2>
        
        <div className="space-y-6">
          {ticket.replies.map((reply) => (
            <div
              key={reply.id}
              className={`flex flex-col gap-2 ${
                reply.portalCustomerId ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                  reply.portalCustomerId
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-slate-200 text-slate-900"
                }`}
              >
                <div className={`mb-1 flex items-center justify-between gap-4 text-[10px] font-bold uppercase tracking-wider ${
                  reply.portalCustomerId ? "text-blue-100" : "text-slate-400"
                }`}>
                  <span>{reply.authorName}</span>
                  <span>{formatRelativeTime(reply.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {reply.message}
                </p>

                {/* Attachments */}
                {reply.attachments && reply.attachments.length > 0 && (
                  <div className={`mt-3 space-y-2 border-t pt-2 ${
                    reply.portalCustomerId ? "border-blue-500/30" : "border-slate-100"
                  }`}>
                    {reply.attachments.map((file) => (
                      <div key={file.id} className="flex items-center gap-2 text-xs font-medium">
                        <Paperclip className="h-3 w-3" />
                        <span className="truncate max-w-[200px]">{file.fileName}</span>
                        <span className="text-[10px] opacity-70">({(file.size / 1024).toFixed(0)} KB)</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reply Box */}
      {["OPEN", "IN_PROGRESS"].includes(ticket.status) ? (
        <PortalReplyBox ticketId={ticketId} orgSlug={orgSlug} />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            This ticket is {ticket.status.toLowerCase()}. You cannot reply to it anymore.
          </p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    OPEN: "bg-emerald-50 text-emerald-700 border-emerald-100",
    IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-100",
    RESOLVED: "bg-slate-50 text-slate-600 border-slate-200",
    CLOSED: "bg-slate-50 text-slate-500 border-slate-200",
  };

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${styles[status] ?? "bg-slate-50 text-slate-600 border-slate-200"}`}>
      {status.replace("_", " ")}
    </span>
  );
}
