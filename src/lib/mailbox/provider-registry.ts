import "server-only";

import type { IMailboxProviderAdapter, MailboxProviderRegistry } from "./provider-contracts";
import { gmailProviderAdapter } from "./gmail-provider";

const registry: MailboxProviderRegistry = new Map([
  ["GMAIL", gmailProviderAdapter],
]);

export function getMailboxProviderAdapter(provider: string): IMailboxProviderAdapter {
  const adapter = registry.get(provider as "GMAIL");
  if (!adapter) {
    throw new Error(`No mailbox provider adapter registered for: ${provider}`);
  }
  return adapter;
}

export function findMailboxProviderAdapter(provider: string): IMailboxProviderAdapter | null {
  return registry.get(provider as any) ?? null;
}

export { registry as mailboxProviderRegistry };
