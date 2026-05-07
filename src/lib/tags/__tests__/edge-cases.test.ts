import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOrgContext: vi.fn(),
  requireRole: vi.fn(),
  documentTagFindMany: vi.fn(),
  documentTagUpdate: vi.fn(),
  documentTagFindFirst: vi.fn(),
  documentTagCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: mocks.requireOrgContext,
  requireRole: mocks.requireRole,
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    documentTag: {
      findMany: mocks.documentTagFindMany,
      update: mocks.documentTagUpdate,
      findFirst: mocks.documentTagFindFirst,
      create: mocks.documentTagCreate,
    },
    $transaction: mocks.transaction,
  },
}));

import { createTag, renameTag, archiveTag, unarchiveTag } from "../tag-service";

const ORG_ID = "org_test";
const ADMIN_CTX = { orgId: ORG_ID, userId: "u1", role: "admin", representedId: null, proxyGrantId: null, proxyScope: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue(ADMIN_CTX);
  mocks.requireOrgContext.mockResolvedValue(ADMIN_CTX);
  mocks.documentTagFindMany.mockResolvedValue([]);
  mocks.documentTagFindFirst.mockResolvedValue(null);
  mocks.documentTagCreate.mockResolvedValue({ id: "tag_1", name: "Test", slug: "test", orgId: ORG_ID });
  mocks.documentTagUpdate.mockResolvedValue({ id: "tag_1", name: "Test", slug: "test", orgId: ORG_ID, isArchived: false });
  mocks.transaction.mockImplementation((ops: unknown[]) => Promise.all(Array.isArray(ops) ? ops.map((f) => typeof f === "function" ? f() : f) : []));
});

describe("archive preserves historical identity", () => {
  it("archived tag maintains its ID", async () => {
    mocks.documentTagFindFirst.mockResolvedValue({ id: "tag_z", name: "Old Tag", orgId: ORG_ID });
    mocks.documentTagUpdate.mockResolvedValue({ id: "tag_z", name: "Old Tag", orgId: ORG_ID, slug: "old-tag", isArchived: true });

    const result = await archiveTag("tag_z");

    expect(result.success).toBe(true);
    expect(result.success && result.data?.id).toBe("tag_z");
  });

  it("renamed tag preserves its ID", async () => {
    mocks.documentTagFindFirst
      .mockResolvedValueOnce({ id: "tag_r", name: "Old Name", orgId: ORG_ID, slug: "old-name" })
      .mockResolvedValueOnce(null);
    mocks.documentTagUpdate.mockResolvedValue({ id: "tag_r", name: "New Name", orgId: ORG_ID, slug: "new-name" });

    const result = await renameTag("tag_r", { name: "New Name" });

    expect(result.success).toBe(true);
    expect(result.success && result.data?.id).toBe("tag_r");
    expect(result.success && result.data?.name).toBe("New Name");
  });

  it("unarchived tag restores to active state", async () => {
    mocks.documentTagFindFirst.mockResolvedValue({ id: "tag_u", name: "Was Archived", orgId: ORG_ID });
    mocks.documentTagUpdate.mockResolvedValue({ id: "tag_u", name: "Was Archived", orgId: ORG_ID, slug: "was-archived", isArchived: false });

    const result = await unarchiveTag("tag_u");

    expect(result.success).toBe(true);
  });
});

describe("cross-org safety", () => {
  it("rejects tag lookup from different org", async () => {
    mocks.documentTagFindFirst.mockResolvedValue(null);

    const result = await archiveTag("other_org_tag");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Tag not found");
  });
});

describe("empty/invalid inputs", () => {
  it("rejects empty tag name on create", async () => {
    const result = await createTag({ name: "  " });
    expect(result.success).toBe(false);
  });

  it("rejects tag name with no alphanumeric chars", async () => {
    const result = await createTag({ name: "!!!" });
    expect(result.success).toBe(false);
  });

  it("rejects rename to empty name", async () => {
    mocks.documentTagFindFirst.mockResolvedValue({ id: "tag_e", name: "Exists", orgId: ORG_ID });
    const result = await renameTag("tag_e", { name: "" });
    expect(result.success).toBe(false);
  });
});

describe("duplicate name rejection", () => {
  it("rejects create when tag with same slug exists", async () => {
    mocks.documentTagFindFirst.mockResolvedValue({ id: "existing", name: "Priority", slug: "priority", orgId: ORG_ID });
    mocks.documentTagFindMany.mockResolvedValue([{ id: "existing" }]);

    const result = await createTag({ name: "Priority" });

    expect(result.success).toBe(false);
  });
});
