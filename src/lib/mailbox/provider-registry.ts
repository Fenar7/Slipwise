import "server-only";

import type { MailboxProvider } from "./domain-types";
import type { IMailboxProviderAdapter, MailboxProviderRegistry } from "./provider-contracts";

const gmailProviderAdapter: any = {
  descriptor: {
    provider: "GMAIL",
    displayName: "Gmail",
    supportsPushSync: false,
    supportsSend: true,
  },
} as any;

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
