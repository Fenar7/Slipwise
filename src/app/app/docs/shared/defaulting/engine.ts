"use server";

import { db } from "@/lib/db";
import type { InvoiceDefaults, VoucherDefaults, QuoteDefaults } from "./types";
import { todayIso, addDays } from "./date-utils";
import { extractPlaceOfSupplyFromGstin } from "./gst-utils";

export async function resolveInvoiceDefaults(params: {
  orgId: string;
  customerId?: string;
  templateParam?: string;
}): Promise<InvoiceDefaults> {
  const orgDefaults = await db.orgDefaults.findUnique({
    where: { organizationId: params.orgId },
  });

  const businessTaxId = orgDefaults?.gstin?.trim() || orgDefaults?.taxId?.trim() || "";
  const bankName = orgDefaults?.bankName?.trim() || "";
  const bankAccountNumber = orgDefaults?.bankAccount?.trim() || "";
  const bankIfsc = orgDefaults?.bankIFSC?.trim() || "";
  const notes = orgDefaults?.defaultInvoiceNotes?.trim() || "";
  const terms = orgDefaults?.defaultInvoiceTerms?.trim() || "";
  const authorizedBy = orgDefaults?.defaultInvoiceAuthorizedBy?.trim() || "";
  const templateId = params.templateParam?.trim() || orgDefaults?.defaultInvoiceTemplate?.trim() || "professional";
  const invoiceDate = todayIso();

  const branding = {
    companyName: "",
    address: orgDefaults?.businessAddress?.trim() || "",
    email: "",
    phone: "",
  };

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

  const customer = await db.customer.findFirst({
    where: {
      id: params.customerId,
      organizationId: params.orgId,
    },
  });

  if (!customer) {
    throw new Error("Customer not found or does not belong to this organisation.");
  }

  const clientTaxId = customer.gstin?.trim() || customer.taxId?.trim() || "";
  const placeOfSupply = customer.gstin?.trim() ? extractPlaceOfSupplyFromGstin(customer.gstin) : "";
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

export async function resolveVoucherDefaults(params: {
  orgId: string;
  vendorId?: string;
  templateParam?: string;
}): Promise<VoucherDefaults> {
  const [org, orgDefaults, brandingProfile] = await Promise.all([
    db.organization.findUnique({
      where: { id: params.orgId },
      select: { name: true },
    }),
    db.orgDefaults.findUnique({
      where: { organizationId: params.orgId },
    }),
    db.brandingProfile.findUnique({
      where: { organizationId: params.orgId },
    }),
  ]);

  const companyName = org?.name?.trim() || "";
  const address = orgDefaults?.businessAddress?.trim() || "";
  const accentColor = brandingProfile?.accentColor?.trim() || "#dc2626";
  const templateId = params.templateParam?.trim() || orgDefaults?.defaultVoucherTemplate?.trim() || "minimal-office";
  const date = todayIso();
  const notes = orgDefaults?.defaultVoucherNotes?.trim() || "";
  const approvedBy = orgDefaults?.defaultVoucherApprovedBy?.trim() || "";
  const receivedBy = orgDefaults?.defaultVoucherReceivedBy?.trim() || "";
  const paymentMode = orgDefaults?.defaultVoucherPaymentMode?.trim() || "";

  if (!params.vendorId) {
    return {
      vendorId: "",
      voucherType: "payment",
      date,
      counterpartyName: "",
      notes,
      approvedBy,
      receivedBy,
      paymentMode,
      referenceNumber: "",
      purpose: "",
      branding: {
        companyName,
        address,
        email: "",
        phone: "",
        accentColor,
      },
      templateId,
    };
  }

  const vendor = await db.vendor.findFirst({
    where: {
      id: params.vendorId,
      organizationId: params.orgId,
    },
  });

  if (!vendor) {
    throw new Error("Vendor not found or does not belong to this organisation.");
  }

  return {
    vendorId: vendor.id,
    voucherType: "payment",
    date,
    counterpartyName: vendor.name,
    notes,
    approvedBy,
    receivedBy,
    paymentMode,
    referenceNumber: "",
    purpose: "",
    branding: {
      companyName,
      address,
      email: "",
      phone: "",
      accentColor,
    },
    templateId,
  };
}

export async function resolveQuoteDefaults(params: {
  orgId: string;
  customerId?: string;
}): Promise<QuoteDefaults> {
  const orgDefaults = await db.orgDefaults.findUnique({
    where: { organizationId: params.orgId },
  });

  const validityDays = orgDefaults?.quoteValidityDays ?? 14;
  const notes = orgDefaults?.defaultQuoteNotes?.trim() || "";
  const termsAndConditions = orgDefaults?.defaultQuoteTerms?.trim() || "";
  const issueDate = todayIso();
  const validUntil = addDays(issueDate, validityDays);

  if (!params.customerId) {
    return {
      customerId: "",
      clientName: "",
      clientEmail: "",
      clientPhone: "",
      clientAddress: "",
      issueDate,
      validUntil,
      notes,
      termsAndConditions,
    };
  }

  const customer = await db.customer.findFirst({
    where: {
      id: params.customerId,
      organizationId: params.orgId,
    },
  });

  if (!customer) {
    throw new Error("Customer not found or does not belong to this organisation.");
  }

  return {
    customerId: customer.id,
    clientName: customer.name,
    clientEmail: customer.email?.trim() || "",
    clientPhone: customer.phone?.trim() || "",
    clientAddress: customer.address?.trim() || "",
    issueDate,
    validUntil,
    notes,
    termsAndConditions,
  };
}
