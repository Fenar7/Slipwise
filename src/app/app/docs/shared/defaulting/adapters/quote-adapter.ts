import { resolveDefaults } from "@/app/app/docs/shared/defaulting/resolver";
import type { DefaultResolutionInput } from "@/app/app/docs/shared/defaulting/types";
import { todayIso, addDays } from "@/app/app/docs/shared/defaulting/date-utils";

export type QuoteAutofillPayload = {
  customerId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  issueDate: string;
  validUntil: string;
  notes: string;
  termsAndConditions: string;
  metadata?: {
    resolvedAt: string;
  };
};

export async function resolveQuoteDefaults(input: {
  orgId: string;
  customerId?: string;
}): Promise<QuoteAutofillPayload> {
  const resolutionInput: DefaultResolutionInput = {
    kind: "quote",
    orgId: input.orgId,
    entityId: input.customerId,
  };

  const resolution = await resolveDefaults(resolutionInput);

  const od = resolution.orgDefaults;
  const entity = resolution.entity;

  const issueDate = todayIso();
  const validityDays = od.quoteValidityDays || 14;
  const validUntil = addDays(issueDate, validityDays);

  return {
    customerId: entity?.id || "",
    clientName: entity?.name || "",
    clientEmail: entity?.email || "",
    clientPhone: entity?.phone || "",
    clientAddress: entity?.address || "",
    issueDate,
    validUntil,
    notes: od.defaultQuoteNotes || "",
    termsAndConditions: od.defaultQuoteTerms || "",
    metadata: {
      resolvedAt: new Date().toISOString(),
    },
  };
}
