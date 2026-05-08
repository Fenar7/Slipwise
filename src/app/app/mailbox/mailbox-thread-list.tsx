"use client";

import { cn } from "@/lib/utils";
import { Paperclip, Flag, UserCircle2 } from "lucide-react";

interface ThreadRowData {
  id: string;
  subject: string;
  snippet: string;
  from: string;
  fromInitial: string;
  fromColor: string;
  timestamp: string;
  isUnread: boolean;
  isFlagged: boolean;
  hasAttachment: boolean;
  mailboxLabel: string;
  mailboxColor: string;
  assignee?: string;
  status: "open" | "pending" | "closed";
}

const MOCK_THREADS: ThreadRowData[] = [
  {
    id: "t1",
    subject: "Invoice #INV-2026-0412 — Payment overdue",
    snippet: "Hi, I wanted to follow up on the invoice we sent last week. Could you confirm the payment status?",
    from: "Priya Sharma",
    fromInitial: "P",
    fromColor: "#7C3AED",
    timestamp: "10:42 AM",
    isUnread: true,
    isFlagged: true,
    hasAttachment: false,
    mailboxLabel: "Billing",
    mailboxColor: "#16294D",
    assignee: "You",
    status: "open",
  },
  {
    id: "t2",
    subject: "Re: Quote QT-2026-0089 — Revised pricing",
    snippet: "Thanks for the revised quote. We've reviewed it internally and have a few questions before we proceed.",
    from: "Arjun Mehta",
    fromInitial: "A",
    fromColor: "#0891B2",
    timestamp: "9:15 AM",
    isUnread: true,
    isFlagged: false,
    hasAttachment: true,
    mailboxLabel: "Billing",
    mailboxColor: "#16294D",
    status: "open",
  },
  {
    id: "t3",
    subject: "Voucher VCH-2026-0031 — Approval needed",
    snippet: "Please find attached the voucher for the March services. Kindly approve at your earliest convenience.",
    from: "Neha Kapoor",
    fromInitial: "N",
    fromColor: "#C05092",
    timestamp: "Yesterday",
    isUnread: false,
    isFlagged: false,
    hasAttachment: true,
    mailboxLabel: "Accounts",
    mailboxColor: "#D97706",
    status: "pending",
  },
  {
    id: "t4",
    subject: "Statement of account — April 2026",
    snippet: "Please find the attached statement of account for April 2026. Let us know if you have any queries.",
    from: "Ravi Nair",
    fromInitial: "R",
    fromColor: "#16A34A",
    timestamp: "Yesterday",
    isUnread: false,
    isFlagged: false,
    hasAttachment: true,
    mailboxLabel: "Billing",
    mailboxColor: "#16294D",
    assignee: "Meera",
    status: "open",
  },
  {
    id: "t5",
    subject: "Support: Unable to download invoice PDF",
    snippet: "Hi team, I'm trying to download the invoice PDF from the portal but keep getting an error. Can you help?",
    from: "Sunita Rao",
    fromInitial: "S",
    fromColor: "#DC2626",
    timestamp: "May 7",
    isUnread: true,
    isFlagged: false,
    hasAttachment: false,
    mailboxLabel: "Support",
    mailboxColor: "#2563EB",
    status: "open",
  },
  {
    id: "t6",
    subject: "Re: TDS certificate for FY 2025-26",
    snippet: "We've processed the TDS certificate. Please find it attached. Let us know if you need any corrections.",
    from: "Vikram Joshi",
    fromInitial: "V",
    fromColor: "#64748B",
    timestamp: "May 6",
    isUnread: false,
    isFlagged: false,
    hasAttachment: true,
    mailboxLabel: "Accounts",
    mailboxColor: "#D97706",
    status: "closed",
  },
];

const STATUS_STYLES: Record<ThreadRowData["status"], string> = {
  open: "bg-blue-50 text-blue-700",
  pending: "bg-amber-50 text-amber-700",
  closed: "bg-gray-100 text-gray-500",
};

function ThreadRow({
  thread,
  isSelected,
  onClick,
}: {
  thread: ThreadRowData;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors",
        isSelected
          ? "bg-[rgba(22,41,77,0.06)]"
          : thread.isUnread
          ? "bg-white hover:bg-[#F7F8FB]"
          : "bg-[#FAFBFC] hover:bg-[#F7F8FB]",
      )}
      style={{ borderColor: "#E2E5EA" }}
      aria-selected={isSelected}
    >
      {/* Unread indicator */}
      <span
        className={cn(
          "absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full transition-opacity",
          thread.isUnread ? "opacity-100" : "opacity-0"
        )}
        style={{ background: "#DC2626" }}
        aria-label="Unread"
      />

      {/* Avatar */}
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ background: thread.fromColor }}
        aria-hidden="true"
      >
        {thread.fromInitial}
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-sm",
              thread.isUnread ? "font-bold text-[#0F172A]" : "font-medium text-[#334155]"
            )}
          >
            {thread.from}
          </span>

          {/* Mailbox source badge */}
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
            style={{
              background: `${thread.mailboxColor}14`,
              color: thread.mailboxColor,
            }}
          >
            {thread.mailboxLabel}
          </span>

          <span className="ml-auto shrink-0 text-[11px] text-[#94A3B8]">{thread.timestamp}</span>
        </div>

        <p
          className={cn(
            "mt-0.5 truncate text-sm",
            thread.isUnread ? "font-semibold text-[#0F172A]" : "text-[#334155]"
          )}
        >
          {thread.subject}
        </p>

        <div className="mt-0.5 flex items-center gap-2">
          <p className="flex-1 truncate text-xs text-[#64748B]">{thread.snippet}</p>

          {/* Indicators */}
          <div className="flex shrink-0 items-center gap-1.5">
            {thread.hasAttachment && (
              <Paperclip className="h-3 w-3 text-[#94A3B8]" aria-label="Has attachment" />
            )}
            {thread.isFlagged && (
              <Flag className="h-3 w-3 text-[#DC2626]" aria-label="Flagged" />
            )}
            {thread.assignee && (
              <span className="flex items-center gap-0.5 text-[10px] font-medium text-[#64748B]">
                <UserCircle2 className="h-3 w-3" />
                {thread.assignee}
              </span>
            )}
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", STATUS_STYLES[thread.status])}>
              {thread.status}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

interface MailboxThreadListProps {
  selectedThreadId: string | null;
  onSelectThread: (id: string) => void;
}

export function MailboxThreadList({ selectedThreadId, onSelectThread }: MailboxThreadListProps) {
  return (
    <div
      className="flex h-full flex-col overflow-hidden border-r"
      style={{ borderColor: "#E2E5EA" }}
      role="list"
      aria-label="Thread list"
    >
      <div className="flex-1 overflow-y-auto">
        {MOCK_THREADS.map((thread) => (
          <ThreadRow
            key={thread.id}
            thread={thread}
            isSelected={selectedThreadId === thread.id}
            onClick={() => onSelectThread(thread.id)}
          />
        ))}
      </div>
    </div>
  );
}

export { MOCK_THREADS };
