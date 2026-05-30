import type { Metadata } from "next";
import { QuoteForm } from "../components/quote-form";
import { listCustomers } from "@/app/app/data/actions";
import { resolveQuoteAutofill } from "../autofill-resolver";

export const metadata: Metadata = {
  title: "New Quote | Slipwise",
  description: "Create a new quote for your customer.",
};

interface PageProps {
  searchParams: Promise<{ customerId?: string }>;
}

export default async function NewQuotePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [customersResult, autofill] = await Promise.all([
    listCustomers({ limit: 200 }).catch(() => ({ customers: [] })),
    resolveQuoteAutofill({
      customerId: params.customerId || undefined,
    }).catch(() => null),
  ]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <QuoteForm 
          customers={customersResult.customers} 
          initialAutofill={autofill ?? undefined}
        />
      </div>
    </div>
  );
}
