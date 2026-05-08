import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOrgContext: vi.fn(),
  customerCreate: vi.fn(),
  customerFindFirst: vi.fn(),
  customerUpdate: vi.fn(),
  customerDelete: vi.fn(),
  customerFindMany: vi.fn(),
  customerCount: vi.fn(),
  vendorCreate: vi.fn(),
  vendorFindFirst: vi.fn(),
  vendorUpdate: vi.fn(),
  vendorDelete: vi.fn(),
  vendorFindMany: vi.fn(),
  vendorCount: vi.fn(),
  revalidatePath: vi.fn(),
  setCustomerDefaultTags: vi.fn(),
  setVendorDefaultTags: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: mocks.requireOrgContext,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/db", () => ({
  db: {
    customer: {
      create: mocks.customerCreate,
      findFirst: mocks.customerFindFirst,
      update: mocks.customerUpdate,
      delete: mocks.customerDelete,
      findMany: mocks.customerFindMany,
      count: mocks.customerCount,
    },
    vendor: {
      create: mocks.vendorCreate,
      findFirst: mocks.vendorFindFirst,
      update: mocks.vendorUpdate,
      delete: mocks.vendorDelete,
      findMany: mocks.vendorFindMany,
      count: mocks.vendorCount,
    },
  },
}));

vi.mock("@/lib/tags/assignment-service", () => ({
  setCustomerDefaultTags: mocks.setCustomerDefaultTags,
  setVendorDefaultTags: mocks.setVendorDefaultTags,
}));

import { createCustomer, updateCustomer, createVendor, updateVendor } from "../actions";

const ORG_ID = "org_test";
const CTX = { orgId: ORG_ID, userId: "u1", role: "admin", representedId: null, proxyGrantId: null, proxyScope: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrgContext.mockResolvedValue(CTX);
  mocks.setCustomerDefaultTags.mockResolvedValue({ success: true, data: [] });
  mocks.setVendorDefaultTags.mockResolvedValue({ success: true, data: [] });
});

describe("createCustomer", () => {
  it("creates customer and sets default tags when tagIds provided", async () => {
    mocks.customerCreate.mockResolvedValue({ id: "cust_1", name: "Test Co" });

    const result = await createCustomer({
      name: "Test Co",
      email: "test@example.com",
      tagIds: ["tag_1", "tag_2"],
    });

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("cust_1");
    expect(mocks.customerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Test Co",
          email: "test@example.com",
          organizationId: ORG_ID,
        }),
      })
    );
    // tagIds should NOT be passed to customer.create
    const createCallData = mocks.customerCreate.mock.calls[0][0].data;
    expect(createCallData).not.toHaveProperty("tagIds");
    // But should call setCustomerDefaultTags
    expect(mocks.setCustomerDefaultTags).toHaveBeenCalledWith("cust_1", ["tag_1", "tag_2"]);
  });

  it("creates customer without default tags when tagIds not provided", async () => {
    mocks.customerCreate.mockResolvedValue({ id: "cust_2", name: "No Tags Co" });

    const result = await createCustomer({ name: "No Tags Co" });

    expect(result.success).toBe(true);
    expect(mocks.setCustomerDefaultTags).not.toHaveBeenCalled();
  });

  it("revalidates customer list path after create", async () => {
    mocks.customerCreate.mockResolvedValue({ id: "cust_3", name: "Revalidate Co" });

    await createCustomer({ name: "Revalidate Co" });

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/data/customers");
  });
});

describe("updateCustomer", () => {
  it("updates customer and sets default tags when tagIds provided", async () => {
    mocks.customerFindFirst.mockResolvedValue({ id: "cust_1", name: "Old Co" });

    const result = await updateCustomer("cust_1", {
      name: "Updated Co",
      tagIds: ["tag_3"],
    });

    expect(result.success).toBe(true);
    expect(mocks.customerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cust_1" },
        data: expect.objectContaining({ name: "Updated Co" }),
      })
    );
    expect(mocks.setCustomerDefaultTags).toHaveBeenCalledWith("cust_1", ["tag_3"]);
  });

  it("only sets tags when only tagIds provided", async () => {
    mocks.customerFindFirst.mockResolvedValue({ id: "cust_1", name: "Old Co" });

    const result = await updateCustomer("cust_1", { tagIds: [] });

    expect(result.success).toBe(true);
    expect(mocks.customerUpdate).not.toHaveBeenCalled();
    expect(mocks.setCustomerDefaultTags).toHaveBeenCalledWith("cust_1", []);
  });

  it("rejects update for non-existent customer", async () => {
    mocks.customerFindFirst.mockResolvedValue(null);

    const result = await updateCustomer("nonexistent", { name: "Nope" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Customer not found");
  });

  it("revalidates both list and detail paths", async () => {
    mocks.customerFindFirst.mockResolvedValue({ id: "cust_1", name: "Old Co" });

    await updateCustomer("cust_1", { name: "New Co" });

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/data/customers");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/data/customers/cust_1");
  });
});

describe("createVendor", () => {
  it("creates vendor and sets default tags when tagIds provided", async () => {
    mocks.vendorCreate.mockResolvedValue({ id: "ven_1", name: "Supplier Co" });

    const result = await createVendor({
      name: "Supplier Co",
      tagIds: ["tag_a"],
    });

    expect(result.success).toBe(true);
    expect(mocks.vendorCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Supplier Co",
          organizationId: ORG_ID,
        }),
      })
    );
    const createCallData = mocks.vendorCreate.mock.calls[0][0].data;
    expect(createCallData).not.toHaveProperty("tagIds");
    expect(mocks.setVendorDefaultTags).toHaveBeenCalledWith("ven_1", ["tag_a"]);
  });

  it("creates vendor without default tags when tagIds not provided", async () => {
    mocks.vendorCreate.mockResolvedValue({ id: "ven_2", name: "Basic Vendor" });

    const result = await createVendor({ name: "Basic Vendor" });

    expect(result.success).toBe(true);
    expect(mocks.setVendorDefaultTags).not.toHaveBeenCalled();
  });
});

describe("updateVendor", () => {
  it("updates vendor and sets default tags when tagIds provided", async () => {
    mocks.vendorFindFirst.mockResolvedValue({ id: "ven_1", name: "Old Vendor" });

    const result = await updateVendor("ven_1", {
      name: "Updated Vendor",
      tagIds: ["tag_x", "tag_y"],
    });

    expect(result.success).toBe(true);
    expect(mocks.vendorUpdate).toHaveBeenCalled();
    expect(mocks.setVendorDefaultTags).toHaveBeenCalledWith("ven_1", ["tag_x", "tag_y"]);
  });

  it("rejects update for non-existent vendor", async () => {
    mocks.vendorFindFirst.mockResolvedValue(null);

    const result = await updateVendor("nonexistent", { name: "Nope" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Vendor not found");
  });

  it("revalidates both list and detail paths", async () => {
    mocks.vendorFindFirst.mockResolvedValue({ id: "ven_1", name: "Old Vendor" });

    await updateVendor("ven_1", { name: "New Vendor" });

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/data/vendors");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/data/vendors/ven_1");
  });
});
