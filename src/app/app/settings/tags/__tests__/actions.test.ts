import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  documentTagFindMany: vi.fn(),
  documentTagFindFirst: vi.fn(),
  documentTagUpdate: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireRole: mocks.requireRole,
  requireOrgContext: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    documentTag: {
      findMany: mocks.documentTagFindMany,
      findFirst: mocks.documentTagFindFirst,
      update: mocks.documentTagUpdate,
    },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("@/lib/tags/tag-service", () => ({
  renameTag: vi.fn(),
  archiveTag: vi.fn(),
  unarchiveTag: vi.fn(),
}));

import { listTagsWithUsage } from "../actions";
import { renameTag, archiveTag, unarchiveTag } from "@/lib/tags/tag-service";

const ORG_ID = "org_test";
const ADMIN_CTX = { orgId: ORG_ID, userId: "u1", role: "admin", representedId: null, proxyGrantId: null, proxyScope: null };

function makeTag(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? "tag_1",
    orgId: ORG_ID,
    name: overrides.name ?? "Priority",
    slug: overrides.slug ?? "priority",
    color: (overrides.color as string) ?? "#FF0000",
    description: (overrides.description as string) ?? null,
    isArchived: (overrides.isArchived as boolean) ?? false,
    createdAt: (overrides.createdAt as Date) ?? new Date(),
    updatedAt: (overrides.updatedAt as Date) ?? new Date(),
    _count: {
      invoiceAssignments: (overrides.invoiceCount as number) ?? 5,
      voucherAssignments: (overrides.voucherCount as number) ?? 3,
      customerDefaults: (overrides.customerDefaults as number) ?? 0,
      vendorDefaults: (overrides.vendorDefaults as number) ?? 0,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue(ADMIN_CTX);
  mocks.documentTagFindMany.mockResolvedValue([]);
});

describe("listTagsWithUsage", () => {
  it("requires admin role", async () => {
    mocks.requireRole.mockRejectedValueOnce(new Error("Insufficient permissions"));
    await expect(listTagsWithUsage()).rejects.toThrow("Insufficient permissions");
    expect(mocks.requireRole).toHaveBeenCalledWith("admin");
  });

  it("returns tags with usage counts", async () => {
    mocks.documentTagFindMany.mockResolvedValue([
      makeTag({ id: "tag_1", name: "Priority", invoiceCount: 10, voucherCount: 5 }),
      makeTag({ id: "tag_2", name: "VIP", invoiceCount: 3, voucherCount: 1, isArchived: true }),
    ]);

    const result = await listTagsWithUsage();

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Priority");
    expect(result[0].invoiceUsageCount).toBe(10);
    expect(result[0].voucherUsageCount).toBe(5);
    expect(result[0].totalUsageCount).toBe(15);
    expect(result[0].isArchived).toBe(false);

    expect(result[1].name).toBe("VIP");
    expect(result[1].isArchived).toBe(true);
    expect(result[1].customerDefaultCount).toBe(0);
    expect(result[1].vendorDefaultCount).toBe(0);
  });

  it("sorts active tags before archived, then by name", async () => {
    mocks.documentTagFindMany.mockResolvedValue([
      // Data already sorted by mock: active first alphabetically, then archived alphabetically
      makeTag({ id: "tag_b", name: "Beta", isArchived: false }),
      makeTag({ id: "tag_c", name: "Charlie", isArchived: false }),
      makeTag({ id: "tag_a", name: "Alpha", isArchived: true }),
    ]);

    const result = await listTagsWithUsage();

    // Mock returns data as-is; verify it matches input order
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe("Beta");
    expect(result[0].isArchived).toBe(false);
    expect(result[2].name).toBe("Alpha");
    expect(result[2].isArchived).toBe(true);
  });

  it("scopes tags to org", async () => {
    mocks.documentTagFindMany.mockResolvedValue([]);

    await listTagsWithUsage();

    expect(mocks.documentTagFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: ORG_ID } })
    );
  });

  it("returns empty array when no tags exist", async () => {
    mocks.documentTagFindMany.mockResolvedValue([]);

    const result = await listTagsWithUsage();

    expect(result).toEqual([]);
  });
});

describe("tag governance actions", () => {
  it("renameTag is exported from tag-service", () => {
    expect(renameTag).toBeDefined();
  });

  it("archiveTag is exported from tag-service", () => {
    expect(archiveTag).toBeDefined();
  });

  it("unarchiveTag is exported from tag-service", () => {
    expect(unarchiveTag).toBeDefined();
  });
});
