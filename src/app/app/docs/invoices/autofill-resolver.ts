"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

export type InvoiceAutofillPayload = {
  customerId: string;
  clientName: string;
  clientAddress: string;
  shippingAddress: string;
  clientEmail: string;
  clientPhone: string;
  clientTaxId: string;
  businessTaxId: string;
  templateId: string;
  invoiceDate: string;
  dueDate: string;
  placeOfSupply: string;
  notes: string;
  terms: string;
  authorizedBy: string;
  bankName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  amountPaid: string;
  branding: {
    companyName: string;
    address: string;
    email: string;
    phone: string;
  };
};

// ─── GSTIN state extraction ──────────────────────────────────────────────────

const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
  "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
  "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
  "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
  "16": "Tripura", "17": "Meghalaya", "18": "Assam",
  "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
  "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "25": "Daman & Diu", "26": "Dadra & Nagar Haveli",
  "27": "Maharashtra", "28": "Andhra Pradesh (Old)",
  "29": "Karnataka", "30": "Goa", "31": "Lakshadweep",
  "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman & Nicobar Islands", "36": "Telangana",
  "37": "Andhra Pradesh", "38": "Ladakh",
};

function extractPlaceOfSupplyFromGstin(gstin: string): string {
  const trimmed = gstin.trim();
  if (trimmed.length < 2) return "";
  const code = trimmed.slice(0, 2);
  return GST_STATE_CODES[code] ?? "";
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Resolver ─────────────────────────────────────────────────────────────────

export async function resolveInvoiceAutofill(params: {
  customerId?: string;
  templateParam?: string;
}): Promise<InvoiceAutofillPayload> {
  const { orgId } = await requireOrgContext();

  const orgDefaults = await db.orgDefaults.findUnique({
    where: { organizationId: orgId },
  });

  // Org-level branding / bank / tax — used regardless of customer selection
  const businessTaxId = orgDefaults?.gstin?.trim()
    || orgDefaults?.taxId?.trim()
    || "";

  const bankName = orgDefaults?.bankName?.trim() || "";
  const bankAccountNumber = orgDefaults?.bankAccount?.trim() || "";
  const bankIfsc = orgDefaults?.bankIFSC?.trim() || "";
  const notes = orgDefaults?.defaultInvoiceNotes?.trim() || "";
  const terms = orgDefaults?.defaultInvoiceTerms?.trim() || "";
  const authorizedBy = orgDefaults?.defaultInvoiceAuthorizedBy?.trim() || "";
  const templateId = params.templateParam?.trim()
    || orgDefaults?.defaultInvoiceTemplate?.trim()
    || "professional";

  const invoiceDate = todayIso();

  // Org branding — fall back to org defaults address if available
  const branding = {
    companyName: "",
    address: orgDefaults?.businessAddress?.trim() || "",
    email: "",
    phone: "",
  };

  // If no customer selected, return org-only defaults with blank customer fields
  if (!params.customerId) {
    return {
      customerId: "",
      clientName: "",
      clientAddress: "",
      shippingAddress: "",
      clientEmail: "",
      clientPhone: "",
      clientTaxId: "",
      businessTaxId,
      templateId,
      invoiceDate,
      dueDate: addDays(invoiceDate, 30),
      placeOfSupply: "",
      notes,
      terms,
      authorizedBy,
      bankName,
      bankAccountNumber,
      bankIfsc,
      amountPaid: "0",
      branding,
    };
  }

  // Load org-scoped customer — cross-org access is impossible by query filter
  const customer = await db.customer.findFirst({
    where: {
      id: params.customerId,
      organizationId: orgId,
    },
  });

  if (!customer) {
    throw new Error("Customer not found or does not belong to this organisation.");
  }

  // Tax ID priority: gstin > taxId
  const clientTaxId = customer.gstin?.trim()
    || customer.taxId?.trim()
    || "";

  // Place of supply: derive from GSTIN state code if available
  const placeOfSupply = customer.gstin?.trim()
    ? extractPlaceOfSupplyFromGstin(customer.gstin)
    : "";

  const paymentTerms = customer.paymentTermsDays ?? 30;

  return {
    customerId: customer.id,
    clientName: customer.name,
    clientAddress: customer.address?.trim() || "",
    shippingAddress: customer.address?.trim() || "",
    clientEmail: customer.email?.trim() || "",
    clientPhone: customer.phone?.trim() || "",
    clientTaxId,
    businessTaxId,
    templateId,
    invoiceDate,
    dueDate: addDays(invoiceDate, paymentTerms),
    placeOfSupply,
    notes,
    terms,
    authorizedBy,
    bankName,
    bankAccountNumber,
    bankIfsc,
    amountPaid: "0",
    branding,
  };
}
