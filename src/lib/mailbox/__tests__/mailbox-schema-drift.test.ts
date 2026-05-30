/**
 * Mailbox schema-drift resilience tests.
 *
 * Verifies that mailbox read surfaces degrade safely (empty results) when
 * mailbox tables are missing (Prisma P2021) or columns are missing (Prisma
 * P2022), instead of crashing with 500s. Non-drift errors still propagate
 * normally.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@/generated/prisma/client";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    mailboxConnection: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    mailboxSavedView: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    mailboxSyncRun: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";

function makeP2021(modelName: string) {
  const error = Object.create(
    Prisma.PrismaClientKnownRequestError.prototype,
  ) as { code: string; meta?: { modelName?: string } };
  error.code = "P2021";
  error.meta = { modelName };
  return error;
}

function makeP2022() {
  const error = Object.create(
    Prisma.PrismaClientKnownRequestError.prototype,
  ) as { code: string; meta?: { modelName?: string } };
  error.code = "P2022";
  error.meta = undefined;
  return error;
}

function makeNonDriftError(message: string) {
  return new Error(message);
}

// ─── connection-service ──────────────────────────────────────────────────────

describe("connection-service schema-drift resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listMailboxConnections returns empty array on P2021", async () => {
    const { listMailboxConnections } = await import("../connection-service");

    vi.mocked(db.mailboxConnection.findMany).mockRejectedValue(
      makeP2021("MailboxConnection"),
    );

    const result = await listMailboxConnections("org-1");
    expect(result).toEqual([]);
  });

  it("listMailboxConnections rethrows non-drift errors", async () => {
    const { listMailboxConnections } = await import("../connection-service");

    vi.mocked(db.mailboxConnection.findMany).mockRejectedValue(
      makeNonDriftError("connection refused"),
    );

    await expect(listMailboxConnections("org-1")).rejects.toThrow(
      "connection refused",
    );
  });

  it("listMailboxConnections returns empty array on P2022 (missing column)", async () => {
    const { listMailboxConnections } = await import("../connection-service");

    vi.mocked(db.mailboxConnection.findMany).mockRejectedValue(makeP2022());

    const result = await listMailboxConnections("org-1");
    expect(result).toEqual([]);
  });

  it("getMailboxConnection returns null on P2021", async () => {
    const { getMailboxConnection } = await import("../connection-service");

    vi.mocked(db.mailboxConnection.findFirst).mockRejectedValue(
      makeP2021("MailboxConnection"),
    );

    const result = await getMailboxConnection("org-1", "conn-1");
    expect(result).toBeNull();
  });

  it("getMailboxConnection rethrows non-drift errors", async () => {
    const { getMailboxConnection } = await import("../connection-service");

    vi.mocked(db.mailboxConnection.findFirst).mockRejectedValue(
      makeNonDriftError("boom"),
    );

    await expect(getMailboxConnection("org-1", "conn-1")).rejects.toThrow(
      "boom",
    );
  });

  it("getMailboxConnection returns null on P2022 (missing column)", async () => {
    const { getMailboxConnection } = await import("../connection-service");

    vi.mocked(db.mailboxConnection.findFirst).mockRejectedValue(makeP2022());

    const result = await getMailboxConnection("org-1", "conn-1");
    expect(result).toBeNull();
  });

  it("findMailboxConnectionByProviderAccount returns null on P2021", async () => {
    const { findMailboxConnectionByProviderAccount } = await import(
      "../connection-service",
    );

    vi.mocked(db.mailboxConnection.findFirst).mockRejectedValue(
      makeP2021("MailboxConnection"),
    );

    const result = await findMailboxConnectionByProviderAccount(
      "org-1",
      "GMAIL",
      "provider-123",
    );
    expect(result).toBeNull();
  });

  it("findMailboxConnectionByProviderAccount returns null on P2022 (missing column)", async () => {
    const { findMailboxConnectionByProviderAccount } = await import(
      "../connection-service",
    );

    vi.mocked(db.mailboxConnection.findFirst).mockRejectedValue(makeP2022());

    const result = await findMailboxConnectionByProviderAccount(
      "org-1",
      "GMAIL",
      "provider-123",
    );
    expect(result).toBeNull();
  });
});

// ─── saved-view-service ─────────────────────────────────────────────────────

describe("saved-view-service schema-drift resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listMailboxSavedViews returns empty array on P2021", async () => {
    const { listMailboxSavedViews } = await import("../saved-view-service");

    vi.mocked(db.mailboxSavedView.findMany).mockRejectedValue(
      makeP2021("MailboxSavedView"),
    );

    const result = await listMailboxSavedViews("org-1", "user-1");
    expect(result).toEqual([]);
  });

  it("listMailboxSavedViews rethrows non-drift errors", async () => {
    const { listMailboxSavedViews } = await import("../saved-view-service");

    vi.mocked(db.mailboxSavedView.findMany).mockRejectedValue(
      makeNonDriftError("db timeout"),
    );

    await expect(listMailboxSavedViews("org-1", "user-1")).rejects.toThrow(
      "db timeout",
    );
  });

  it("listMailboxSavedViews returns empty array on P2022 (missing column)", async () => {
    const { listMailboxSavedViews } = await import("../saved-view-service");

    vi.mocked(db.mailboxSavedView.findMany).mockRejectedValue(makeP2022());

    const result = await listMailboxSavedViews("org-1", "user-1");
    expect(result).toEqual([]);
  });
});

// ─── sync-run-read-service ──────────────────────────────────────────────────

describe("sync-run-read-service schema-drift resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getMailboxSyncRunsByConnectionIds returns empty maps on P2021", async () => {
    const { getMailboxSyncRunsByConnectionIds } = await import(
      "../sync-run-read-service",
    );

    vi.mocked(db.mailboxSyncRun.findMany).mockRejectedValue(
      makeP2021("MailboxSyncRun"),
    );

    const result = await getMailboxSyncRunsByConnectionIds("org-1", [
      "conn-1",
      "conn-2",
    ]);
    expect(result.latestRunByConnectionId.size).toBe(0);
    expect(result.latestCompletedRunByConnectionId.size).toBe(0);
  });

  it("getMailboxSyncRunsByConnectionIds rethrows non-drift errors", async () => {
    const { getMailboxSyncRunsByConnectionIds } = await import(
      "../sync-run-read-service",
    );

    vi.mocked(db.mailboxSyncRun.findMany).mockRejectedValue(
      makeNonDriftError("unexpected"),
    );

    await expect(
      getMailboxSyncRunsByConnectionIds("org-1", ["conn-1"]),
    ).rejects.toThrow("unexpected");
  });

  it("getMailboxSyncRunsByConnectionIds returns empty maps on P2022 (missing column)", async () => {
    const { getMailboxSyncRunsByConnectionIds } = await import(
      "../sync-run-read-service",
    );

    vi.mocked(db.mailboxSyncRun.findMany).mockRejectedValue(makeP2022());

    const result = await getMailboxSyncRunsByConnectionIds("org-1", [
      "conn-1",
      "conn-2",
    ]);
    expect(result.latestRunByConnectionId.size).toBe(0);
    expect(result.latestCompletedRunByConnectionId.size).toBe(0);
  });
});

// ─── visibility-service integration ─────────────────────────────────────────

describe("visibility-service schema-drift resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listMailboxConnectionsForMember returns empty results when all mailbox tables are missing", async () => {
    const { listMailboxConnectionsForMember } = await import(
      "../visibility-service",
    );

    // mailbox_connection is the first table hit — P2021 there causes
    // listMailboxConnections to return [], so the rest is never called.
    vi.mocked(db.mailboxConnection.findMany).mockRejectedValue(
      makeP2021("MailboxConnection"),
    );

    const result = await listMailboxConnectionsForMember(
      "org-1",
      "user-1",
      "admin",
    );
    expect(result.accessible).toEqual([]);
    expect(result.restricted).toEqual([]);
  });

  it("listMailboxConnectionsForMember returns empty results on P2022 (missing column)", async () => {
    const { listMailboxConnectionsForMember } = await import(
      "../visibility-service",
    );

    // P2022 on mailbox_connection causes listMailboxConnections to return [],
    // so the rest of the visibility pipeline is never called.
    vi.mocked(db.mailboxConnection.findMany).mockRejectedValue(makeP2022());

    const result = await listMailboxConnectionsForMember(
      "org-1",
      "user-1",
      "admin",
    );
    expect(result.accessible).toEqual([]);
    expect(result.restricted).toEqual([]);
  });
});
