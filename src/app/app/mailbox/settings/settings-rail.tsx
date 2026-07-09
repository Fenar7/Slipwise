"use client";

/**
 * SettingsRail
 *
 * Thin client wrapper that wires real mailbox connections to the left rail
 * for the settings layout. Keeps settings/layout.tsx as a server component.
 *
 * Uses useMailboxConnections() so the settings sidebar shows the same truthful
 * connection list as the main workspace — no mock-data fallback.
 */

import { MailboxLeftRail } from "../mailbox-left-rail";
import { useMailboxConnections } from "../use-mailbox-connections";

export function SettingsRail() {
  const { connections } = useMailboxConnections();
  return <MailboxLeftRail connections={connections} />;
}
