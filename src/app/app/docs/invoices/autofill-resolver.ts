"use server";

import { requireOrgContext } from "@/lib/auth";
import { resolveInvoiceDefaults, type InvoiceDefaults } from "../shared/defaulting";

export type InvoiceAutofillPayload = InvoiceDefaults;

export async function resolveInvoiceAutofill(params: {
  customerId?: string;
  templateParam?: string;
}): Promise<InvoiceAutofillPayload> {
  const { orgId } = await requireOrgContext();
  return resolveInvoiceDefaults({
    orgId,
    customerId: params.customerId,
    templateParam: params.templateParam,
  });
}
