"use server";

import { requireOrgContext } from "@/lib/auth";
import { resolveQuoteDefaults } from "@/app/app/docs/shared/defaulting/adapters/quote-adapter";
import type { QuoteAutofillPayload } from "@/app/app/docs/shared/defaulting/adapters/quote-adapter";

export type { QuoteAutofillPayload };

export async function resolveQuoteAutofill(params: {
  customerId?: string;
}): Promise<QuoteAutofillPayload> {
  const { orgId } = await requireOrgContext();

  return resolveQuoteDefaults({
    orgId,
    customerId: params.customerId,
  });
}
