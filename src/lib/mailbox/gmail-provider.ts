import "server-only";

import type { IMailboxProviderAdapter } from "./provider-contracts";

export const gmailProviderAdapter: IMailboxProviderAdapter = {
  descriptor: {
    provider: "GMAIL",
    displayName: "Gmail",
    supportsPushSync: true,
    supportsSend: true,
  },

  async connect() {
    throw new Error("Gmail connect not implemented");
  },

  async refreshAuthorization() {
    throw new Error("Gmail refresh not implemented");
  },

  async verifyConnection() {
    throw new Error("Gmail verify not implemented");
  },

  async syncDelta() {
    throw new Error("Gmail sync not implemented");
  },

  async fetchThreadDetail() {
    throw new Error("Gmail fetch thread not implemented");
  },

  async disconnect() {
    // Best-effort cleanup
  },

  async sendMessage() {
    throw new Error("Gmail send not implemented");
  },

  async reconcileSend() {
    throw new Error("Gmail reconcile not implemented");
  },
};
