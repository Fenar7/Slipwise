"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { setCustomerDefaultTags, setVendorDefaultTags } from "@/lib/tags/assignment-service";

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

export async function listCustomers(params?: {
  search?: string;
  page?: number;
  limit?: number;
  filter?: ClientFilter;
}) {
  const { orgId } = await requireOrgContext();
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const skip = (page - 1) * limit;

  const lifecycleFilter =
    params?.filter && params.filter !== "all" && !params.filter.startsWith("portal")
      ? params.filter
      : undefined;

  const where: Record<string, unknown> = {
    organizationId: orgId,
  };
  if (params?.search) {
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { email: { contains: params.search, mode: "insensitive" } },
    ];
  }
  if (lifecycleFilter === "active") {
    where.lifecycleStage = { in: ["ACTIVE", "WON"] };
  } else if (lifecycleFilter === "prospect") {
    where.lifecycleStage = { in: ["PROSPECT", "QUALIFIED"] };
  } else if (lifecycleFilter === "at-risk") {
    where.lifecycleStage = { in: ["AT_RISK", "NEGOTIATION"] };
  } else if (lifecycleFilter === "churned") {
    where.lifecycleStage = "CHURNED";
  }

  const [rawCustomers, total] = await Promise.all([
    db.customer.findMany({
      where: where as Parameters<typeof db.customer.findMany>[0]["where"],
      skip,
      take: limit,
      orderBy: { name: "asc" },
      include: {
        _count: { select: { invoices: true, quotes: true } },
        portalTokens: { select: { id: true }, take: 1 },
      },
    }),
    db.customer.count({ where: where as Parameters<typeof db.customer.count>[0]["where"] }),
  ]);

  const customers = rawCustomers.map((c) => {
    const customer = c as typeof c & {
      _count: { invoices: number; quotes: number };
      portalTokens: { id: string }[];
    };
    const outstandingBalance = Number(customer.totalInvoiced) - Number(customer.totalPaid);
    const lastActivityAt = customer.lastInteractionAt ?? customer.updatedAt;

    const hasEmail = !!customer.email;
    const hasPortalToken = customer.portalTokens.length > 0;
    const portalStatus = hasPortalToken
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

  let filteredCustomers = customers;
  if (params?.filter?.startsWith("portal")) {
    filteredCustomers = customers.filter((c) => {
      if (params.filter === "portal-enabled") return c.portalStatus === "enabled";
      if (params.filter === "portal-disabled") return c.portalStatus !== "enabled";
      return true;
    });
  }

  return {
    customers: filteredCustomers,
    total: params?.filter?.startsWith("portal") ? filteredCustomers.length : total,
    page,
    totalPages: Math.ceil(
      (params?.filter?.startsWith("portal") ? filteredCustomers.length : total) / limit
    ),
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
