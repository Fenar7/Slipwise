"use client";

/**
 * Sprint 1.6 — Updated reading pane empty state.
 * Delegates to NoThreadSelectedEmpty for consistent Sprint 1.6 treatment.
 */

import { NoThreadSelectedEmpty } from "./mailbox-empty-states";

export function MailboxReadingPaneEmpty({ viewLabel }: { viewLabel?: string }) {
  return <NoThreadSelectedEmpty viewLabel={viewLabel} />;
}
