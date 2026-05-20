"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { setCustomerDefaultTags, setVendorDefaultTags } from "@/lib/tags/assignment-service";

function escapeSqlLike(input: string): string {
  return input.replace(/[%_\\]/g, "\\$&").replace(/'/g, "''");
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActionResult<T> = 
  | { success: true; data: T }
  | { success: false; error: string };

// ─── Customer Actions ─────────────────────────────────────────────────────────

export interface CustomerInput {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  gstin?: string;
  tagIds?: string[];
}

export async function createCustomer(input: CustomerInput): Promise<ActionResult<{ id: string }>> {
  try {
    const { orgId } = await requireOrgContext();
    
    const { tagIds, ...customerData } = input;

    const customer = await db.customer.create({
      data: {
        ...customerData,
        organizationId: orgId,
      },
    });
    
    if (tagIds !== undefined) {
      await setCustomerDefaultTags(customer.id, tagIds);
    }
    
    revalidatePath("/app/data/customers");
    return { success: true, data: { id: customer.id } };
  } catch (error) {
    console.error("createCustomer error:", error);
    return { success: false, error: "Failed to create customer" };
  }
}

export async function updateCustomer(
  id: string, 
  input: Partial<CustomerInput>
): Promise<ActionResult<{ id: string }>> {
  try {
    const { orgId } = await requireOrgContext();
    
    // Verify ownership
    const existing = await db.customer.findFirst({
      where: { id, organizationId: orgId },
    });
    
    if (!existing) {
      return { success: false, error: "Customer not found" };
    }
    
    const { tagIds, ...customerData } = input;

    if (Object.keys(customerData).length > 0) {
      await db.customer.update({
        where: { id },
        data: customerData,
      });
    }

    if (tagIds !== undefined) {
      await setCustomerDefaultTags(id, tagIds);
    }
    
    revalidatePath("/app/data/customers");
    revalidatePath(`/app/data/customers/${id}`);
    return { success: true, data: { id } };
  } catch (error) {
    console.error("updateCustomer error:", error);
    return { success: false, error: "Failed to update customer" };
  }
}

export async function deleteCustomer(id: string): Promise<ActionResult<void>> {
  try {
    const { orgId } = await requireOrgContext();
    
    const existing = await db.customer.findFirst({
      where: { id, organizationId: orgId },
    });
    
    if (!existing) {
      return { success: false, error: "Customer not found" };
    }
    
    await db.customer.delete({ where: { id } });
    
    revalidatePath("/app/data/customers");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("deleteCustomer error:", error);
    return { success: false, error: "Failed to delete customer" };
  }
}

export async function getCustomer(id: string) {
  const { orgId } = await requireOrgContext();
  
  return db.customer.findFirst({
    where: { id, organizationId: orgId },
  });
}

export type ClientFilter =
  | "all"
  | "active"
  | "prospect"
  | "at-risk"
  | "churned"
  | "portal-enabled"
  | "portal-disabled";

export type SortKey = "name" | "outstandingBalance" | "lastActivityAt";
export type SortDir = "asc" | "desc";

export async function listCustomers(params?: {
  search?: string;
  page?: number;
  limit?: number;
  filter?: ClientFilter;
  sort?: { key: SortKey; dir: SortDir };
}) {
  const { orgId } = await requireOrgContext();
  const page = Math.max(1, Number.isFinite(params?.page) && params!.page! > 0 ? params!.page! : 1);
  const limit = params?.limit ?? 20;
  const skip = (page - 1) * limit;
  const filter = params?.filter ?? "all";
  const sort = params?.sort;

  const where: Record<string, unknown> = {
    organizationId: orgId,
  };

  if (params?.search) {
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { email: { contains: params.search, mode: "insensitive" } },
      { phone: { contains: params.search, mode: "insensitive" } },
    ];
  }

  if (filter === "active") {
    where.lifecycleStage = { in: ["ACTIVE", "WON"] };
  } else if (filter === "prospect") {
    where.lifecycleStage = { in: ["PROSPECT", "QUALIFIED"] };
  } else if (filter === "at-risk") {
    where.lifecycleStage = { in: ["AT_RISK", "NEGOTIATION"] };
  } else if (filter === "churned") {
    where.lifecycleStage = "CHURNED";
  }

  if (filter === "portal-enabled") {
    where.portalTokens = {
      some: {
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
    };
  } else if (filter === "portal-disabled") {
    where.NOT = {
      portalTokens: {
        some: {
          isRevoked: false,
          expiresAt: { gt: new Date() },
        },
      },
    };
  }

  let rawCustomers: Array<Awaited<ReturnType<typeof db.customer.findMany>>[number]>;
  let total: number;

  if (sort?.key === "outstandingBalance") {
    const dir = sort.dir === "asc" ? "ASC" : "DESC";
    const conditions = [`c."organizationId" = '${orgId}'`];
    if (params?.search) {
      const esc = escapeSqlLike(params.search);
      conditions.push(`(c.name ILIKE '%${esc}%' OR c.email ILIKE '%${esc}%' OR c.phone ILIKE '%${esc}%')`);
    }
    if (filter === "active") {
      conditions.push(`c."lifecycleStage" IN ('ACTIVE', 'WON')`);
    } else if (filter === "prospect") {
      conditions.push(`c."lifecycleStage" IN ('PROSPECT', 'QUALIFIED')`);
    } else if (filter === "at-risk") {
      conditions.push(`c."lifecycleStage" IN ('AT_RISK', 'NEGOTIATION')`);
    } else if (filter === "churned") {
      conditions.push(`c."lifecycleStage" = 'CHURNED'`);
    } else if (filter === "portal-enabled") {
      conditions.push(`EXISTS (SELECT 1 FROM "customer_portal_token" t WHERE t."customerId" = c.id AND t."isRevoked" = false AND t."expiresAt" > NOW())`);
    } else if (filter === "portal-disabled") {
      conditions.push(`NOT EXISTS (SELECT 1 FROM "customer_portal_token" t WHERE t."customerId" = c.id AND t."isRevoked" = false AND t."expiresAt" > NOW())`);
    }
    const whereSql = conditions.join(" AND ");
    const countResult = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint as count FROM "customer" c WHERE ${whereSql}`
    );
    total = Number(countResult[0].count);
    const idResult = await db.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT c.id FROM "customer" c WHERE ${whereSql} ORDER BY (COALESCE(c."totalInvoiced", 0) - COALESCE(c."totalPaid", 0)) ${dir} LIMIT ${limit} OFFSET ${skip}`
    );
    const ids = idResult.map((r) => r.id);
    if (ids.length === 0) {
      rawCustomers = [];
    } else {
      const records = await db.customer.findMany({
        where: {
          id: { in: ids },
          organizationId: orgId,
        },
        include: {
          _count: { select: { invoices: true, quotes: true } },
          portalTokens: {
            select: { id: true, isRevoked: true, expiresAt: true },
            take: 1,
            orderBy: { createdAt: "desc" },
          },
        },
      });
      const recordMap = new Map(records.map((r) => [r.id, r]));
      rawCustomers = ids.map((id) => recordMap.get(id)!).filter(Boolean) as typeof records;
    }
  } else {
    let orderBy: NonNullable<Parameters<typeof db.customer.findMany>[0]>["orderBy"];
    if (sort?.key === "name") {
      orderBy = { name: sort.dir };
    } else if (sort?.key === "lastActivityAt") {
      orderBy = [
        { lastInteractionAt: sort.dir },
        { updatedAt: sort.dir },
      ];
    } else {
      orderBy = { name: "asc" };
    }
    [rawCustomers, total] = await Promise.all([
      db.customer.findMany({
        where: where as NonNullable<Parameters<typeof db.customer.findMany>[0]>["where"],
        skip,
        take: limit,
        orderBy,
        include: {
          _count: { select: { invoices: true, quotes: true } },
          portalTokens: {
            select: { id: true, isRevoked: true, expiresAt: true },
            take: 1,
            orderBy: { createdAt: "desc" },
          },
        },
      }),
      db.customer.count({ where: where as NonNullable<Parameters<typeof db.customer.count>[0]>["where"] }),
    ]);
  }

  const customers = rawCustomers.map((c) => {
    const customer = c as typeof c & {
      _count: { invoices: number; quotes: number };
      portalTokens: { id: string; isRevoked: boolean; expiresAt: Date }[];
    };
    const outstandingBalance = Number(customer.totalInvoiced) - Number(customer.totalPaid);
    const lastActivityAt = customer.lastInteractionAt ?? customer.updatedAt;
    const hasEmail = !!customer.email;
    const hasValidToken = customer.portalTokens.some(
      (t) => !t.isRevoked && t.expiresAt > new Date()
    );
    const portalStatus: "enabled" | "invited" | "ineligible" = hasValidToken
      ? "enabled"
      : hasEmail
        ? "invited"
        : "ineligible";
    return {
      ...customer,
      outstandingBalance,
      lastActivityAt,
      portalStatus,
      invoiceCount: customer._count.invoices,
      quoteCount: customer._count.quotes,
    };
  });

  return {
    customers,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

// ─── Vendor Actions ───────────────────────────────────────────────────────────

export interface VendorInput {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  gstin?: string;
  tagIds?: string[];
}

export async function createVendor(input: VendorInput): Promise<ActionResult<{ id: string }>> {
  try {
    const { orgId } = await requireOrgContext();
    
    const { tagIds, ...vendorData } = input;

    const vendor = await db.vendor.create({
      data: {
        ...vendorData,
        organizationId: orgId,
      },
    });
    
    if (tagIds !== undefined) {
      await setVendorDefaultTags(vendor.id, tagIds);
    }
    
    revalidatePath("/app/data/vendors");
    return { success: true, data: { id: vendor.id } };
  } catch (error) {
    console.error("createVendor error:", error);
    return { success: false, error: "Failed to create vendor" };
  }
}

export async function updateVendor(
  id: string, 
  input: Partial<VendorInput>
): Promise<ActionResult<{ id: string }>> {
  try {
    const { orgId } = await requireOrgContext();
    
    const existing = await db.vendor.findFirst({
      where: { id, organizationId: orgId },
    });
    
    if (!existing) {
      return { success: false, error: "Vendor not found" };
    }
    
    const { tagIds, ...vendorData } = input;

    if (Object.keys(vendorData).length > 0) {
      await db.vendor.update({
        where: { id },
        data: vendorData,
      });
    }

    if (tagIds !== undefined) {
      await setVendorDefaultTags(id, tagIds);
    }
    
    revalidatePath("/app/data/vendors");
    revalidatePath(`/app/data/vendors/${id}`);
    return { success: true, data: { id } };
  } catch (error) {
    console.error("updateVendor error:", error);
    return { success: false, error: "Failed to update vendor" };
  }
}

export async function deleteVendor(id: string): Promise<ActionResult<void>> {
  try {
    const { orgId } = await requireOrgContext();
    
    const existing = await db.vendor.findFirst({
      where: { id, organizationId: orgId },
    });
    
    if (!existing) {
      return { success: false, error: "Vendor not found" };
    }
    
    await db.vendor.delete({ where: { id } });
    
    revalidatePath("/app/data/vendors");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("deleteVendor error:", error);
    return { success: false, error: "Failed to delete vendor" };
  }
}

export async function getVendor(id: string) {
  const { orgId } = await requireOrgContext();
  
  return db.vendor.findFirst({
    where: { id, organizationId: orgId },
  });
}

export async function listVendors(params?: {
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { orgId } = await requireOrgContext();
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const skip = (page - 1) * limit;
  
  const where = {
    organizationId: orgId,
    ...(params?.search && {
      OR: [
        { name: { contains: params.search, mode: "insensitive" as const } },
        { email: { contains: params.search, mode: "insensitive" as const } },
      ],
    }),
  };
  
  const [vendors, total] = await Promise.all([
    db.vendor.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: "asc" },
    }),
    db.vendor.count({ where }),
  ]);
  
  return {
    vendors,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

// ─── Employee Actions ─────────────────────────────────────────────────────────

export interface EmployeeInput {
  name: string;
  email?: string;
  employeeId?: string;
  designation?: string;
  department?: string;
  bankName?: string;
  bankAccount?: string;
  bankIFSC?: string;
  panNumber?: string;
}

export async function createEmployee(input: EmployeeInput): Promise<ActionResult<{ id: string }>> {
  try {
    const { orgId } = await requireOrgContext();
    
    const employee = await db.employee.create({
      data: {
        ...input,
        organizationId: orgId,
      },
    });
    
    revalidatePath("/app/data/employees");
    return { success: true, data: { id: employee.id } };
  } catch (error) {
    console.error("createEmployee error:", error);
    return { success: false, error: "Failed to create employee" };
  }
}

export async function updateEmployee(
  id: string, 
  input: Partial<EmployeeInput>
): Promise<ActionResult<{ id: string }>> {
  try {
    const { orgId } = await requireOrgContext();
    
    const existing = await db.employee.findFirst({
      where: { id, organizationId: orgId },
    });
    
    if (!existing) {
      return { success: false, error: "Employee not found" };
    }
    
    await db.employee.update({
      where: { id },
      data: input,
    });
    
    revalidatePath("/app/data/employees");
    revalidatePath(`/app/data/employees/${id}`);
    return { success: true, data: { id } };
  } catch (error) {
    console.error("updateEmployee error:", error);
    return { success: false, error: "Failed to update employee" };
  }
}

export async function deleteEmployee(id: string): Promise<ActionResult<void>> {
  try {
    const { orgId } = await requireOrgContext();
    
    const existing = await db.employee.findFirst({
      where: { id, organizationId: orgId },
    });
    
    if (!existing) {
      return { success: false, error: "Employee not found" };
    }
    
    await db.employee.delete({ where: { id } });
    
    revalidatePath("/app/data/employees");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("deleteEmployee error:", error);
    return { success: false, error: "Failed to delete employee" };
  }
}

export async function getEmployee(id: string) {
  const { orgId } = await requireOrgContext();
  
  return db.employee.findFirst({
    where: { id, organizationId: orgId },
  });
}

export async function listEmployees(params?: {
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { orgId } = await requireOrgContext();
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const skip = (page - 1) * limit;
  
  const where = {
    organizationId: orgId,
    ...(params?.search && {
      OR: [
        { name: { contains: params.search, mode: "insensitive" as const } },
        { email: { contains: params.search, mode: "insensitive" as const } },
        { employeeId: { contains: params.search, mode: "insensitive" as const } },
      ],
    }),
  };
  
  const [employees, total] = await Promise.all([
    db.employee.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: "asc" },
    }),
    db.employee.count({ where }),
  ]);
  
  return {
    employees,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

// ─── Entity Workspaces (with relations) ───────────────────────────────────────

export async function getCustomerWithRelations(id: string) {
  const { orgId } = await requireOrgContext();

  const customer = await db.customer.findFirst({
    where: { id, organizationId: orgId },
    include: {
      _count: { select: { crmNotes: true, invoices: true, quotes: true } },
      defaultTagAssignments: { include: { tag: { select: { id: true, name: true, slug: true, color: true, isArchived: true } } } },
    },
  });

  if (!customer) return null;

  const [recentInvoices, recentQuotes] = await Promise.all([
    db.invoice.findMany({
      where: { organizationId: orgId, customerId: id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, invoiceNumber: true, status: true, totalAmount: true, createdAt: true },
    }),
    db.quote.findMany({
      where: { orgId: orgId, customerId: id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, quoteNumber: true, status: true, totalAmount: true, createdAt: true },
    }),
  ]);

  return { customer, recentInvoices, recentQuotes };
}

export async function getVendorWithRelations(id: string) {
  const { orgId } = await requireOrgContext();

  const vendor = await db.vendor.findFirst({
    where: { id, organizationId: orgId },
    include: {
      _count: { select: { crmNotes: true, bills: true, purchaseOrders: true } },
      defaultTagAssignments: { include: { tag: { select: { id: true, name: true, slug: true, color: true, isArchived: true } } } },
    },
  });

  if (!vendor) return null;

  const [recentBills, recentPurchaseOrders] = await Promise.all([
    db.vendorBill.findMany({
      where: { orgId: orgId, vendorId: id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, billNumber: true, status: true, totalAmount: true, createdAt: true },
    }),
    db.purchaseOrder.findMany({
      where: { orgId: orgId, vendorId: id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, poNumber: true, status: true, totalAmount: true, createdAt: true },
    }),
  ]);

  return { vendor, recentBills, recentPurchaseOrders };
}

export async function getEmployeeWithRelations(id: string) {
  const { orgId } = await requireOrgContext();

  const employee = await db.employee.findFirst({
    where: { id, organizationId: orgId },
    include: {
      _count: { select: { salarySlips: true } },
    },
  });

  if (!employee) return null;

  const recentSalarySlips = await db.salarySlip.findMany({
    where: { organizationId: orgId, employeeId: id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, slipNumber: true, month: true, year: true, status: true, netPay: true, createdAt: true },
  });

  return { employee, recentSalarySlips };
}
