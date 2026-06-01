import { db } from "@/lib/db";
import { resolveDefaults } from "@/app/app/docs/shared/defaulting/resolver";
import type { DefaultResolutionInput, BaselineMetadata } from "@/app/app/docs/shared/defaulting/types";
import { todayIso } from "@/app/app/docs/shared/defaulting/date-utils";
import { buildBaseline } from "@/app/app/docs/shared/defaulting/stale-detection";

export type VoucherAutofillPayload = {
  vendorId: string;
  voucherType: "payment" | "receipt";
  date: string;
  counterpartyName: string;
  notes: string;
  approvedBy: string;
  receivedBy: string;
  paymentMode: string;
  referenceNumber: string;
  purpose: string;
  branding: {
    companyName: string;
    address: string;
    email: string;
    phone: string;
    accentColor: string;
  };
  templateId: string;
  baseline: BaselineMetadata;
};

export async function resolveVoucherDefaults(input: {
  orgId: string;
  vendorId?: string;
  templateParam?: string;
}): Promise<VoucherAutofillPayload> {
  const resolutionInput: DefaultResolutionInput = {
    kind: "voucher",
    orgId: input.orgId,
    entityId: input.vendorId,
    queryParams: input.templateParam ? { template: input.templateParam } : undefined,
  };

  const [resolution, org, brandingProfile] = await Promise.all([
    resolveDefaults(resolutionInput),
    db.organization.findUnique({ where: { id: input.orgId }, select: { name: true } }),
    db.brandingProfile.findUnique({ where: { organizationId: input.orgId } }),
  ]);

  const od = resolution.orgDefaults;
  const entity = resolution.entity;
  const templateId = resolution.templateId;
  const date = todayIso();
  const baseline = buildBaseline(resolution, resolutionInput);

  return {
    vendorId: entity?.id || "",
    voucherType: "payment",
    date,
    counterpartyName: entity?.name || "",
    notes: od.defaultVoucherNotes || "",
    approvedBy: od.defaultVoucherApprovedBy || "",
    receivedBy: od.defaultVoucherReceivedBy || "",
    paymentMode: od.defaultVoucherPaymentMode || "",
    referenceNumber: "",
    purpose: "",
    branding: {
      companyName: org?.name?.trim() || "",
      address: od.businessAddress || "",
      email: "",
      phone: "",
      accentColor: brandingProfile?.accentColor?.trim() || "#dc2626",
    },
    templateId,
    baseline,
  };
}
