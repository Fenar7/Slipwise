import { resolveDefaults } from "@/app/app/docs/shared/defaulting/resolver";
import type { DefaultResolutionInput, BaselineMetadata } from "@/app/app/docs/shared/defaulting/types";
import { todayIso, addDays } from "@/app/app/docs/shared/defaulting/date-utils";
import { extractPlaceOfSupplyFromGstin } from "@/app/app/docs/shared/defaulting/gst-utils";
import { buildBaseline } from "@/app/app/docs/shared/defaulting/stale-detection";

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
  baseline: BaselineMetadata;
};

export async function resolveInvoiceDefaults(input: {
  orgId: string;
  customerId?: string;
  templateParam?: string;
}): Promise<InvoiceAutofillPayload> {
  const resolutionInput: DefaultResolutionInput = {
    kind: "invoice",
    orgId: input.orgId,
    entityId: input.customerId,
    queryParams: input.templateParam ? { template: input.templateParam } : undefined,
  };

  const resolution = await resolveDefaults(resolutionInput);

  const od = resolution.orgDefaults;
  const entity = resolution.entity;

  const businessTaxId = od.gstin || od.taxId || "";
  const templateId = resolution.templateId;
  const invoiceDate = todayIso();

  const dueDate = entity
    ? addDays(invoiceDate, entity.paymentTermsDays)
    : addDays(invoiceDate, 30);

  const placeOfSupply = entity?.gstin
    ? extractPlaceOfSupplyFromGstin(entity.gstin)
    : "";

  const clientTaxId = entity
    ? entity.gstin || entity.taxId || ""
    : "";

  const baseline = buildBaseline(resolution, resolutionInput);

  return {
    customerId: entity?.id || "",
    clientName: entity?.name || "",
    clientAddress: entity?.address || "",
    shippingAddress: entity?.address || "",
    clientEmail: entity?.email || "",
    clientPhone: entity?.phone || "",
    clientTaxId,
    businessTaxId,
    templateId,
    invoiceDate,
    dueDate,
    placeOfSupply,
    notes: od.defaultInvoiceNotes || "",
    terms: od.defaultInvoiceTerms || "",
    authorizedBy: od.defaultInvoiceAuthorizedBy || "",
    bankName: od.bankName || "",
    bankAccountNumber: od.bankAccount || "",
    bankIfsc: od.bankIFSC || "",
    amountPaid: "0",
    branding: {
      companyName: "",
      address: od.businessAddress || "",
      email: "",
      phone: "",
    },
    baseline,
  };
}
