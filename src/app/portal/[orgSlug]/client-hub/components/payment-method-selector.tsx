"use client";

import { useState } from "react";
import { formatCurrency } from "./views";
import type { MockInvoice } from "./mock-data";

function ShellCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-[var(--hub-border)] bg-white shadow-[var(--hub-card-shadow)] ${className}`}>{children}</section>
  );
}

export function PaymentMethodSelector({
  invoice,
  acceptedMethods,
}: {
  invoice: MockInvoice;
  acceptedMethods: string[];
}) {
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const amountDue = invoice.remainingAmount || invoice.totalAmount;

  const methods = acceptedMethods.slice(0, 3).map((method) => ({
    id: method,
    label: method,
    description:
      method === "Payment Link"
        ? "Secure online payment via Stripe or Telr"
        : method === "Bank Transfer"
          ? "Transfer directly to our bank account"
          : "Pay using your preferred UPI app",
  }));

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-[13px] font-medium text-[var(--hub-text-soft)]">Amount Due</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[var(--hub-text-strong)] sm:text-5xl">
          {formatCurrency(amountDue)}
        </h1>
        <p className="mt-2 text-[13px] text-[var(--hub-text-soft)]">
          Invoice #{invoice.invoiceNumber} · Due {invoice.dueDate}
        </p>
      </div>

      <section>
        <h2 className="text-center text-2xl font-semibold tracking-[-0.03em] text-[var(--hub-text-strong)] sm:text-[28px]">How would you like to pay?</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {methods.map((method) => {
            const isSelected = selectedMethod === method.id;
            return (
              <button
                key={method.id}
                type="button"
                onClick={() => setSelectedMethod(isSelected ? null : method.id)}
                className={`flex items-start gap-4 rounded-xl border px-5 py-4 text-left transition ${
                  isSelected
                    ? "border-[var(--hub-accent)] bg-[var(--hub-accent-faint)]"
                    : "border-[var(--hub-border)] bg-white hover:border-[var(--hub-accent-soft)]"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--hub-text-strong)]">{method.label}</p>
                  <p className="mt-1 text-[13px] text-[var(--hub-text-soft)]">{method.description}</p>
                </div>
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${isSelected ? "border-[var(--hub-accent)] bg-[var(--hub-accent)] text-white" : "border-[var(--hub-border)] bg-white text-transparent"}`}>
                  <span className="h-2.5 w-2.5 rounded-full bg-current" />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {selectedMethod === "Bank Transfer" && (
        <ShellCard className="p-6">
          <h3 className="text-sm font-semibold text-[var(--hub-text-strong)]">Payment Instructions</h3>
          <div className="mt-4 space-y-3 text-[13px] text-[var(--hub-text-soft)]">
            <div className="flex justify-between border-b border-[var(--hub-border)] pb-3">
              <span>Bank Name</span>
              <span className="font-medium text-[var(--hub-text-strong)]">Emirates NBD</span>
            </div>
            <div className="flex justify-between border-b border-[var(--hub-border)] pb-3">
              <span>Account Name</span>
              <span className="font-medium text-[var(--hub-text-strong)]">Acme Corporation</span>
            </div>
            <div className="flex justify-between border-b border-[var(--hub-border)] pb-3">
              <span>Account Number</span>
              <span className="font-medium text-[var(--hub-text-strong)]">1234567890123</span>
            </div>
            <div className="flex justify-between border-b border-[var(--hub-border)] pb-3">
              <span>IBAN</span>
              <span className="font-medium text-[var(--hub-text-strong)]">AE07 0123 4567 8901 2345 678</span>
            </div>
            <div className="flex justify-between">
              <span>Reference</span>
              <span className="font-medium text-[var(--hub-text-strong)]">{invoice.invoiceNumber}</span>
            </div>
          </div>
          <p className="mt-4 text-[11px] text-[var(--hub-text-muted)]">
            Please include the invoice number in your transfer reference. Transfers typically take 1–2 business days to
            process.
          </p>
        </ShellCard>
      )}

      {selectedMethod === "Payment Link" && (
        <ShellCard className="p-6">
          <h3 className="text-sm font-semibold text-[var(--hub-text-strong)]">Payment Instructions</h3>
          <div className="mt-4 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface-soft)]/40 px-5 py-10 text-center text-[13px] text-[var(--hub-text-muted)]">
            Secure redirect instructions will appear here in the live product.
          </div>
        </ShellCard>
      )}

      {selectedMethod === "UPI" && (
        <ShellCard className="p-6">
          <h3 className="text-sm font-semibold text-[var(--hub-text-strong)]">Payment Instructions</h3>
          <div className="mt-4 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface-soft)]/40 px-5 py-10 text-center text-[13px] text-[var(--hub-text-muted)]">
            UPI instructions will appear here in the live product.
          </div>
        </ShellCard>
      )}
    </div>
  );
}
