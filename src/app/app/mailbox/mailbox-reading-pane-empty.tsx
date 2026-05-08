"use client";

import { Mail } from "lucide-react";

export function MailboxReadingPaneEmpty() {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center"
      style={{ background: "#F7F8FB" }}
      aria-label="No thread selected"
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ background: "rgba(22,41,77,0.06)" }}
      >
        <Mail className="h-6 w-6" style={{ color: "#16294D" }} />
      </div>
      <div>
        <p className="text-sm font-semibold text-[#0F172A]">Select a thread to read</p>
        <p className="mt-1 text-xs text-[#64748B]">
          Choose a conversation from the list to view its messages here.
        </p>
      </div>
    </div>
  );
}
