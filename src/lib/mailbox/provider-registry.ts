import "server-only";

import type { MailboxProvider } from "./domain-types";
import type { IMailboxProviderAdapter, MailboxProviderRegistry } from "./provider-contracts";
import { gmailProviderAdapter } from "./gmail-provider";

const mailboxProviderRegistry: MailboxProviderRegistry = new Map([
  ["GMAIL", gmailProviderAdapter],
]);

export function getMailboxProviderAdapter(
  provider: MailboxProvider,
): IMailboxProviderAdapter {
  const adapter = mailboxProviderRegistry.get(provider);
  if (!adapter) {
    throw new Error(`Mailbox provider adapter is not registered: ${provider}`);
  }
  return adapter;
}

export { mailboxProviderRegistry };
