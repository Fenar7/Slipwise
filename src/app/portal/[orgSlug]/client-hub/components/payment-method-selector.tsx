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
    <section
      className={`rounded-[28px] border border-[var(--hub-border)] bg-white shadow-[var(--hub-card-shadow)] ${className}`}
    >
      {children}
    </section>
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
      {/* Amount due */}
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-[var(--hub-text-muted)]">Amount Due</p>
        <h1 className="mt-3 text-5xl font-semibold tracking-[-0.05em] text-[var(--hub-text-strong)] sm:text-6xl">
          {formatCurrency(amountDue)}
        </h1>
        <p className="mt-2 text-sm text-[var(--hub-text-soft)]">
          Invoice #{invoice.invoiceNumber} · Due {invoice.dueDate}
        </p>
      </div>

      {/* Payment methods */}
      <section>
        <h2 className="text-center text-lg font-semibold text-[var(--hub-text-strong)]">How would you like to pay?</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {methods.map((method) => {
            const isSelected = selectedMethod === method.id;
            return (
              <button
                key={method.id}
                type="button"
                onClick={() => setSelectedMethod(isSelected ? null : method.id)}
                className={`flex items-start gap-4 rounded-[24px] border px-6 py-5 text-left transition ${
                  isSelected
                    ? "border-[var(--hub-accent)] bg-[var(--hub-accent-faint)] shadow-[0_8px_24px_rgba(var(--hub-accent-rgb),0.12)]"
                    : "border-[var(--hub-border)] bg-white shadow-[var(--hub-card-shadow)] hover:border-[var(--hub-accent-soft)]"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
                    isSelected
                      ? "border-[var(--hub-accent)] bg-[var(--hub-accent)]"
                      : "border-[var(--hub-border)] bg-white"
                  }`}
                >
                  {isSelected && <span className="h-2 w-2 rounded-full bg-[#152033]" />}
                </span>
                <div>
                  <p className="text-base font-semibold text-[var(--hub-text-strong)]">{method.label}</p>
                  <p className="mt-1 text-sm text-[var(--hub-text-soft)]">{method.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Instructions panel */}
      {selectedMethod === "Bank Transfer" && (
        <ShellCard className="p-6">
          <h3 className="text-base font-semibold text-[var(--hub-text-strong)]">Bank Transfer Instructions</h3>
          <div className="mt-4 space-y-3 text-sm text-[var(--hub-text-soft)]">
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
          <p className="mt-4 text-xs text-[var(--hub-text-muted)]">
            Please include the invoice number in your transfer reference. Transfers typically take 1–2 business days to
            process.
          </p>
        </ShellCard>
      )}

      {selectedMethod === "Payment Link" && (
        <ShellCard className="p-6">
          <h3 className="text-base font-semibold text-[var(--hub-text-strong)]">Online Payment</h3>
          <p className="mt-2 text-sm text-[var(--hub-text-soft)]">
            You will be redirected to a secure payment page to complete your transaction.
          </p>
          <div className="mt-4 rounded-xl border border-[var(--hub-border)] bg-slate-50 p-4 text-center text-sm text-[var(--hub-text-muted)]">
            Static Phase 1 shell — secure redirect will be enabled in a later phase.
          </div>
        </ShellCard>
      )}

      {selectedMethod === "UPI" && (
        <ShellCard className="p-6">
          <h3 className="text-base font-semibold text-[var(--hub-text-strong)]">UPI Payment</h3>
          <p className="mt-2 text-sm text-[var(--hub-text-soft)]">Use your UPI app to scan and pay.</p>
          <div className="mt-4 rounded-xl border border-[var(--hub-border)] bg-slate-50 p-4 text-center text-sm text-[var(--hub-text-muted)]">
            Static Phase 1 shell — UPI integration will be enabled in a later phase.
          </div>
        </ShellCard>
      )}
    </div>
  );
}
