/**
 * Workspace hydration state machine for Sprint 5.1.
 */

export type WorkspaceHydrationState =
  | { kind: "loading" }
  | { kind: "empty-org" }
  | { kind: "no-selection" }
  | { kind: "ready"; canSend: boolean }
  | { kind: "restricted"; reason?: string }
  | { kind: "archived" }
  | { kind: "locked" }
  | { kind: "degraded" }
  | { kind: "error"; message: string };
