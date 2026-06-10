"use client";

import React from "react";
import { MessageSquare, ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * MessagingAccessDenied — Sprint 11.3
 *
 * Shown when a user attempts to access the messaging workspace
 * without the required messaging:read permission.
 * Fails closed: no workspace content is rendered.
 */
export function MessagingAccessDenied() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#f8f9fc]">
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100"
          data-testid="messaging-access-denied-icon"
        >
          <MessageSquare className="h-8 w-8 text-gray-400" />
        </div>
        <div>
          <h2
            className="text-lg font-semibold text-[#1C1B1F]"
            data-testid="messaging-access-denied-title"
          >
            Messaging access required
          </h2>
          <p
            className="mt-1 text-sm text-[#79747E]"
            data-testid="messaging-access-denied-message"
          >
            You do not have permission to access the messaging workspace.
            Contact your organization admin to request access.
          </p>
        </div>
        <Link
          href="/app/home"
          className="inline-flex items-center gap-2 rounded-lg border border-[#E0E0E0] bg-white px-4 py-2 text-sm font-medium text-[#49454F] transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-2"
          data-testid="messaging-access-denied-back"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
      </div>
    </div>
  );
}
