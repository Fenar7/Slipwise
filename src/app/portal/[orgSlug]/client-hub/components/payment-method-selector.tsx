"use client";

import { useState } from "react";
import { formatCurrency } from "./views";
import { initiatePortalPayment } from "../../actions";

/**
 * Shared source of truth for which payment methods are actually actionable.
 * In this sprint:
 * - Payment Link is available (Client Hub can initiate it)
 * - Bank Transfer is available only when bank details exist
 * - UPI is not supported
 * - Unknown methods are excluded
 */
export function getActionablePaymentMethods(
  acceptedMethods: string[],
  hasBankDetails: boolean,
): string[] {
  return acceptedMethods.filter((method) => {
    if (method === "UPI") return false;
    if (method === "Bank Transfer") return hasBankDetails;
    if (method === "Payment Link") return true;
    return false;
  });
}

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
  orgSlug,
  invoice,
  acceptedMethods,
}: {
  orgSlug: string;
  invoice: {
    id: string;
    invoiceNumber: string;
    dueDate: string | null;
    totalAmount: number;
    remainingAmount: number;
    organization: {
      name: string;
      defaults: {
        bankName: string | null;
        bankAccount: string | null;
        bankIFSC: string | null;
      } | null;
    } | null;
  };
  acceptedMethods: string[];
}) {
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountDue = invoice.remainingAmount || invoice.totalAmount;

  const hasBankDetails = !!(
    invoice.organization?.defaults?.bankName ||
    invoice.organization?.defaults?.bankAccount ||
    invoice.organization?.defaults?.bankIFSC
  );

  const methods = getActionablePaymentMethods(acceptedMethods, hasBankDetails).map((method) => ({
      id: method,
      label: method,
      description:
        method === "Payment Link"
          ? "Secure online payment via payment gateway"
          : "Transfer directly to our bank account",
    }));

  const handlePayNow = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await initiatePortalPayment(orgSlug, invoice.id);
      if (res && res.url) {
        window.location.href = res.url;
      } else {
        setError(res?.error ?? "Unable to initiate online payment. Please contact support or use another payment method.");
      }
    } catch (err: unknown) {
      console.error(err);
      setError("Something went wrong while initiating the payment. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-[13px] font-medium text-[var(--hub-text-soft)]">Amount Due</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[var(--hub-text-strong)] sm:text-5xl">
          {formatCurrency(amountDue)}
        </h1>
        <p className="mt-2 text-[13px] text-[var(--hub-text-soft)]">
          Invoice #{invoice.invoiceNumber} · Due {invoice.dueDate ?? "—"}
        </p>
      </div>

      {methods.length === 0 ? (
        <ShellCard className="p-6 text-center text-[13px] text-[var(--hub-text-soft)]">
          No online payment options are currently configured for this invoice. Please contact support to settle this invoice.
        </ShellCard>
      ) : (
        <>
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
                {invoice.organization?.defaults?.bankName && (
                  <div className="flex justify-between border-b border-[var(--hub-border)] pb-3">
                    <span>Bank Name</span>
                    <span className="font-medium text-[var(--hub-text-strong)]">{invoice.organization.defaults.bankName}</span>
                  </div>
                )}
                {invoice.organization?.defaults?.bankAccount && (
                  <div className="flex justify-between border-b border-[var(--hub-border)] pb-3">
                    <span>Account Number</span>
                    <span className="font-medium text-[var(--hub-text-strong)]">{invoice.organization.defaults.bankAccount}</span>
                  </div>
                )}
                {invoice.organization?.defaults?.bankIFSC && (
                  <div className="flex justify-between border-b border-[var(--hub-border)] pb-3">
                    <span>IFSC / Routing Code</span>
                    <span className="font-medium text-[var(--hub-text-strong)]">{invoice.organization.defaults.bankIFSC}</span>
                  </div>
                )}
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
              <h3 className="text-sm font-semibold text-[var(--hub-text-strong)]">Payment Link</h3>
              <p className="mt-2 text-[13px] text-[var(--hub-text-soft)]">
                You will be securely redirected to our payment gateway to complete this transaction.
              </p>
              {error && (
                <div className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-600">
                  {error}
                </div>
              )}
              <button
                type="button"
                disabled={loading}
                onClick={handlePayNow}
                className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[var(--hub-accent)] px-5 py-3.5 text-[13px] font-semibold text-white transition hover:brightness-[0.97] disabled:opacity-50"
              >
                {loading ? "Initiating..." : "PROCEED TO SECURE PAYMENT"}
              </button>
            </ShellCard>
          )}
        </>
      )}
    </div>
  );
}
