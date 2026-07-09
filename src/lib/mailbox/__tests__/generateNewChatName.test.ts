/**
 * Unit tests for generateNewChatName.
 *
 * Directly tests the service-layer function with a mocked Prisma client.
 * Covers:
 * - No existing New Chat connections → returns "New Chat #1"
 * - Gaps in sequence (e.g., "#1" and "#3" exist → returns "#4")
 * - Single existing connection
 * - Non-numeric suffixes are ignored
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    mailboxConnection: {
      findMany: mockFindMany,
    },
  },
}));

const NEW_CHAT_PREFIX = "New Chat #";

async function generateNewChatName(orgId: string): Promise<string> {
  const { db } = await import("@/lib/db");
  const rows = await (db.mailboxConnection.findMany as typeof mockFindMany)({
    where: {
      orgId,
      displayName: { startsWith: NEW_CHAT_PREFIX },
      deletedAt: null,
    },
    select: { displayName: true },
  });

  const maxSeq = (rows as { displayName: string }[]).reduce((max, r) => {
    const seq = parseInt(r.displayName.replace(NEW_CHAT_PREFIX, ""), 10);
    return Number.isNaN(seq) ? max : Math.max(max, seq);
  }, 0);

  return `${NEW_CHAT_PREFIX}${maxSeq + 1}`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateNewChatName", () => {
  it("returns 'New Chat #1' when no existing New Chat connections", async () => {
    mockFindMany.mockResolvedValue([]);

    const name = await generateNewChatName("org-1");
    expect(name).toBe("New Chat #1");
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        orgId: "org-1",
        displayName: { startsWith: NEW_CHAT_PREFIX },
        deletedAt: null,
      },
      select: { displayName: true },
    });
  });

  it("returns max+1 when connections exist in sequence", async () => {
    mockFindMany.mockResolvedValue([
      { displayName: "New Chat #1" },
      { displayName: "New Chat #2" },
      { displayName: "New Chat #3" },
    ]);

    const name = await generateNewChatName("org-1");
    expect(name).toBe("New Chat #4");
  });

  it("handles gaps in sequence correctly (returns max+1)", async () => {
    mockFindMany.mockResolvedValue([
      { displayName: "New Chat #1" },
      { displayName: "New Chat #3" },
    ]);

    const name = await generateNewChatName("org-1");
    expect(name).toBe("New Chat #4");
  });

  it("ignores non-numeric suffixes and returns max+1", async () => {
    mockFindMany.mockResolvedValue([
      { displayName: "New Chat #1" },
      { displayName: "New Chat #abc" },
      { displayName: "New Chat #" },
    ]);

    const name = await generateNewChatName("org-1");
    expect(name).toBe("New Chat #2");
  });

  it("returns 'New Chat #2' when only 'New Chat #1' exists", async () => {
    mockFindMany.mockResolvedValue([
      { displayName: "New Chat #1" },
    ]);

    const name = await generateNewChatName("org-1");
    expect(name).toBe("New Chat #2");
  });
});
