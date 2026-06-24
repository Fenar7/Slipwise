import "server-only";

/**
 * Realtime event emitter for mailbox connection changes.
 *
 * Uses Supabase Realtime via the existing server-side Supabase client.
 * Events are emitted after the DB transaction commits so subscribers
 * receive a consistent view of the data.
 *
 * Fail-open: if Supabase is unavailable or emits an error, the event
 * is silently dropped — the caller's mutation still succeeds.
 */

export type MailboxConnectionEventType =
  | "mailbox_connection_created"
  | "mailbox_connection_updated"
  | "mailbox_connection_deleted";

export interface MailboxConnectionEventPayload {
  id: string;
  orgId: string;
}

/**
 * Broadcast a mailbox connection event via Supabase Realtime.
 *
 * @param event - The event type name.
 * @param payload - Minimal payload with id and orgId only.
 */
export async function emitMailboxConnectionEvent(
  event: MailboxConnectionEventType,
  payload: MailboxConnectionEventPayload,
): Promise<void> {
  try {
    const { createSupabaseAdmin } = await import("@/lib/supabase/server");
    const supabase = createSupabaseAdmin();
    const channel = (await supabase).channel("mailbox-connection-events");
    await channel.send({
      type: "broadcast",
      event,
      payload,
    });
    // Unsubscribe to clean up the channel subscription immediately.
    await (await supabase).removeChannel(channel);
  } catch (error) {
    console.warn("[realtime] Failed to emit mailbox connection event:", error);
  }
}
