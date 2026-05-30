"use server";

import { requireOrgContext } from "@/lib/auth";
import { resolveQuoteDefaults, type QuoteDefaults } from "../shared/defaulting";

export type QuoteAutofillPayload = QuoteDefaults & {
  metadata?: {
    resolvedAt: string;
  };
};

export async function resolveQuoteAutofill(params: {
  customerId?: string;
}): Promise<QuoteAutofillPayload> {
  const { orgId } = await requireOrgContext();
  const defaults = await resolveQuoteDefaults({
    orgId,
    customerId: params.customerId,
  });
  return {
    ...defaults,
    metadata: {
      resolvedAt: new Date().toISOString(),
    },
  };
}
