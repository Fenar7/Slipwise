import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOrgContext: vi.fn(),
  requireRole: vi.fn(),
  documentTagCreate: vi.fn(),
  documentTagFindFirst: vi.fn(),
  documentTagFindMany: vi.fn(),
  documentTagUpdate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: mocks.requireOrgContext,
  requireRole: mocks.requireRole,
}));

vi.mock("@/lib/db", () => ({
  db: {
    documentTag: {
      create: mocks.documentTagCreate,
      findFirst: mocks.documentTagFindFirst,
      findMany: mocks.documentTagFindMany,
      update: mocks.documentTagUpdate,
    },
  },
}));

import { createTag, listTags, getTag, renameTag, archiveTag, unarchiveTag } from "../tag-service";

const ORG_ID = "org_abc";
const ADMIN_CTX = { orgId: ORG_ID, userId: "user_1", role: "admin", representedId: null, proxyGrantId: null, proxyScope: [] };
const MEMBER_CTX = { orgId: ORG_ID, userId: "user_2", role: "member", representedId: null, proxyGrantId: null, proxyScope: [] };

function makeTag(overrides: Record<string, unknown> = {}) {
  return {
    id: "tag_001",
    orgId: ORG_ID,
    name: "Hotel Sarovar",
    slug: "hotel-sarovar",
    color: "#3b82f6",
    description: null,
    isArchived: false,
    createdAt: new Date("2026-05-07T00:00:00Z"),
    updatedAt: new Date("2026-05-07T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createTag", () => {
  it("creates a tag with a normalized slug", async () => {
    mocks.requireRole.mockResolvedValue(ADMIN_CTX);
    mocks.documentTagFindFirst.mockResolvedValue(null);
    const tag = makeTag();
    mocks.documentTagCreate.mockResolvedValue(tag);

    const result = await createTag({ name: "Hotel Sarovar", color: "#3b82f6" });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(tag);
    expect(mocks.documentTagCreate).toHaveBeenCalledWith({
      data: { orgId: ORG_ID, name: "Hotel Sarovar", slug: "hotel-sarovar", color: "#3b82f6", description: null },
    });
  });

  it("trims name and generates a clean slug", async () => {
    mocks.requireRole.mockResolvedValue(ADMIN_CTX);
    mocks.documentTagFindFirst.mockResolvedValue(null);
    const tag = makeTag({ name: "  Mumbai Branch  ", slug: "mumbai-branch" });
    mocks.documentTagCreate.mockResolvedValue(tag);

    const result = await createTag({ name: "  Mumbai Branch  " });

    expect(result.success).toBe(true);
    expect(mocks.documentTagCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: "mumbai-branch" }) })
    );
  });

  it("rejects empty name", async () => {
    mocks.requireRole.mockResolvedValue(ADMIN_CTX);

    const result = await createTag({ name: "   " });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Tag name is required");
  });

  it("rejects name with no alphanumeric characters", async () => {
    mocks.requireRole.mockResolvedValue(ADMIN_CTX);

    const result = await createTag({ name: "---!!!" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Tag name must contain at least one letter or number");
  });

  it("rejects duplicate tag by case-insensitive slug", async () => {
    mocks.requireRole.mockResolvedValue(ADMIN_CTX);
    mocks.documentTagFindFirst.mockResolvedValue(makeTag({ slug: "hotel-sarovar" }));

    const result = await createTag({ name: "HOTEL SAROVAR" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("A tag with a similar name already exists in your organization");
    expect(mocks.documentTagFindFirst).toHaveBeenCalledWith({
      where: { orgId: ORG_ID, slug: "hotel-sarovar" },
      select: { id: true },
    });
  });

  it("requires admin role", async () => {
    mocks.requireRole.mockRejectedValue(new Error("Insufficient permissions"));

    const result = await createTag({ name: "Test" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to create tag");
  });
});

describe("listTags", () => {
  it("lists active tags by default", async () => {
    mocks.requireOrgContext.mockResolvedValue(MEMBER_CTX);
    const tags = [makeTag(), makeTag({ id: "tag_002", name: "Wedding Season", slug: "wedding-season" })];
    mocks.documentTagFindMany.mockResolvedValue(tags);

    const result = await listTags();

    expect(result.success).toBe(true);
    expect(result.data).toEqual(tags);
    expect(mocks.documentTagFindMany).toHaveBeenCalledWith({
      where: { orgId: ORG_ID, isArchived: false },
      orderBy: { name: "asc" },
    });
  });

  it("includes archived tags when requested", async () => {
    mocks.requireOrgContext.mockResolvedValue(MEMBER_CTX);
    mocks.documentTagFindMany.mockResolvedValue([]);

    const result = await listTags({ includeArchived: true });

    expect(result.success).toBe(true);
    expect(mocks.documentTagFindMany).toHaveBeenCalledWith({
      where: { orgId: ORG_ID },
      orderBy: { name: "asc" },
    });
  });
});

describe("getTag", () => {
  it("returns tag by id", async () => {
    mocks.requireOrgContext.mockResolvedValue(MEMBER_CTX);
    const tag = makeTag();
    mocks.documentTagFindFirst.mockResolvedValue(tag);

    const result = await getTag("tag_001");

    expect(result.success).toBe(true);
    expect(result.data).toEqual(tag);
    expect(mocks.documentTagFindFirst).toHaveBeenCalledWith({
      where: { id: "tag_001", orgId: ORG_ID },
    });
  });

  it("returns error for non-existent tag", async () => {
    mocks.requireOrgContext.mockResolvedValue(MEMBER_CTX);
    mocks.documentTagFindFirst.mockResolvedValue(null);

    const result = await getTag("nonexistent");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Tag not found");
  });

  it("returns error for tag in a different org", async () => {
    mocks.requireOrgContext.mockResolvedValue(MEMBER_CTX);
    mocks.documentTagFindFirst.mockResolvedValue(null);

    const result = await getTag("tag_from_other_org");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Tag not found");
  });
});

describe("renameTag", () => {
  it("renames a tag and updates slug", async () => {
    mocks.requireRole.mockResolvedValue(ADMIN_CTX);
    const existing = makeTag({ name: "Hotel Sarovar", slug: "hotel-sarovar" });
    mocks.documentTagFindFirst.mockResolvedValueOnce(existing);
    mocks.documentTagFindFirst.mockResolvedValueOnce(null);
    const updated = makeTag({ name: "Hotel Grand", slug: "hotel-grand" });
    mocks.documentTagUpdate.mockResolvedValue(updated);

    const result = await renameTag("tag_001", { name: "Hotel Grand" });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(updated);
    expect(mocks.documentTagUpdate).toHaveBeenCalledWith({
      where: { id: "tag_001" },
      data: { name: "Hotel Grand", slug: "hotel-grand" },
    });
  });

  it("allows rename to same slug (case change only)", async () => {
    mocks.requireRole.mockResolvedValue(ADMIN_CTX);
    const existing = makeTag({ name: "hotel-sarovar", slug: "hotel-sarovar" });
    mocks.documentTagFindFirst.mockResolvedValue(existing);
    const updated = makeTag({ name: "Hotel Sarovar", slug: "hotel-sarovar" });
    mocks.documentTagUpdate.mockResolvedValue(updated);

    const result = await renameTag("tag_001", { name: "Hotel Sarovar" });

    expect(result.success).toBe(true);
    expect(mocks.documentTagUpdate).toHaveBeenCalledWith({
      where: { id: "tag_001" },
      data: { name: "Hotel Sarovar" },
    });
  });

  it("rejects rename to a name already used by another tag", async () => {
    mocks.requireRole.mockResolvedValue(ADMIN_CTX);
    const existing = makeTag({ name: "Old Name", slug: "old-name" });
    mocks.documentTagFindFirst.mockResolvedValueOnce(existing);
    const conflict = makeTag({ id: "tag_002", name: "New Name", slug: "new-name" });
    mocks.documentTagFindFirst.mockResolvedValueOnce(conflict);

    const result = await renameTag("tag_001", { name: "New Name" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("A tag with a similar name already exists in your organization");
  });

  it("returns error for non-existent tag", async () => {
    mocks.requireRole.mockResolvedValue(ADMIN_CTX);
    mocks.documentTagFindFirst.mockResolvedValue(null);

    const result = await renameTag("nonexistent", { name: "New" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Tag not found");
  });

  it("requires admin role", async () => {
    mocks.requireRole.mockRejectedValue(new Error("Insufficient permissions"));

    const result = await renameTag("tag_001", { name: "New" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to rename tag");
  });
});

describe("archiveTag", () => {
  it("archives an active tag", async () => {
    mocks.requireRole.mockResolvedValue(ADMIN_CTX);
    const existing = makeTag();
    mocks.documentTagFindFirst.mockResolvedValue(existing);
    const archived = makeTag({ isArchived: true });
    mocks.documentTagUpdate.mockResolvedValue(archived);

    const result = await archiveTag("tag_001");

    expect(result.success).toBe(true);
    expect(result.data.isArchived).toBe(true);
    expect(mocks.documentTagUpdate).toHaveBeenCalledWith({
      where: { id: "tag_001" },
      data: { isArchived: true },
    });
  });

  it("returns error for non-existent tag", async () => {
    mocks.requireRole.mockResolvedValue(ADMIN_CTX);
    mocks.documentTagFindFirst.mockResolvedValue(null);

    const result = await archiveTag("nonexistent");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Tag not found");
  });

  it("requires admin role", async () => {
    mocks.requireRole.mockRejectedValue(new Error("Insufficient permissions"));

    const result = await archiveTag("tag_001");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to archive tag");
  });
});

describe("unarchiveTag", () => {
  it("unarchives an archived tag", async () => {
    mocks.requireRole.mockResolvedValue(ADMIN_CTX);
    const existing = makeTag({ isArchived: true });
    mocks.documentTagFindFirst.mockResolvedValue(existing);
    const active = makeTag({ isArchived: false });
    mocks.documentTagUpdate.mockResolvedValue(active);

    const result = await unarchiveTag("tag_001");

    expect(result.success).toBe(true);
    expect(result.data.isArchived).toBe(false);
    expect(mocks.documentTagUpdate).toHaveBeenCalledWith({
      where: { id: "tag_001" },
      data: { isArchived: false },
    });
  });

  it("returns error for non-existent tag", async () => {
    mocks.requireRole.mockResolvedValue(ADMIN_CTX);
    mocks.documentTagFindFirst.mockResolvedValue(null);

    const result = await unarchiveTag("nonexistent");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Tag not found");
  });
});
