"use server";

import { requireOrgContext } from "@/lib/auth";
import { resolveInvoiceDefaults } from "@/app/app/docs/shared/defaulting/adapters/invoice-adapter";
import type { InvoiceAutofillPayload } from "@/app/app/docs/shared/defaulting/adapters/invoice-adapter";

export type { InvoiceAutofillPayload };

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
