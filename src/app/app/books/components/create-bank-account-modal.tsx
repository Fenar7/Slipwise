"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { BankAccountType } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { FormField, FormGrid, financeInputClassName } from "@/components/forms/form-primitives";
import { createBooksBankAccount } from "../actions";

const ACCOUNT_TYPES: Array<{ value: BankAccountType; label: string }> = [
  { value: "BANK", label: "Bank" },
  { value: "CASH", label: "Cash" },
  { value: "PETTY_CASH", label: "Petty Cash" },
  { value: "GATEWAY_CLEARING", label: "Gateway Clearing" },
];

export function CreateBankAccountModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [type, setType] = useState<BankAccountType>("BANK");
  const [bankName, setBankName] = useState("");
  const [maskedAccountNo, setMaskedAccountNo] = useState("");
  const [ifscOrSwift, setIfscOrSwift] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [openingBalanceDate, setOpeningBalanceDate] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setType("BANK");
    setBankName("");
    setMaskedAccountNo("");
    setIfscOrSwift("");
    setCurrency("INR");
    setOpeningBalance("0");
    setOpeningBalanceDate("");
    setIsPrimary(false);
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function submit() {
    setError(null);

    startTransition(async () => {
      const parsedOpeningBalance = Number.parseFloat(openingBalance || "0");
      const result = await createBooksBankAccount({
        name,
        type,
        bankName,
        maskedAccountNo,
        ifscOrSwift,
        currency,
        openingBalance: Number.isFinite(parsedOpeningBalance) ? parsedOpeningBalance : 0,
        openingBalanceDate: openingBalanceDate || undefined,
        isPrimary,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      close();
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>New Bank Account</Button>

      <Modal
        open={open}
        onClose={close}
        title="Add bank account"
        subtitle="Create a cash, bank, or gateway-clearing account for reconciliation."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={isPending}>
              {isPending ? "Creating..." : "Create Bank Account"}
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-4 rounded-lg bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
            {error}
          </div>
        )}

        <FormGrid>
          <FormField label="Account name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. HDFC Current Account"
              className={financeInputClassName}
            />
          </FormField>

          <FormField label="Type" required>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as BankAccountType)}
              className={financeInputClassName}
            >
              {ACCOUNT_TYPES.map((accountType) => (
                <option key={accountType.value} value={accountType.value}>
                  {accountType.label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Bank name">
            <input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. HDFC Bank"
              className={financeInputClassName}
            />
          </FormField>

          <FormField label="Masked account #">
            <input
              value={maskedAccountNo}
              onChange={(e) => setMaskedAccountNo(e.target.value)}
              placeholder="e.g. XXXX1234"
              className={financeInputClassName}
            />
          </FormField>

          <FormField label="IFSC / SWIFT">
            <input
              value={ifscOrSwift}
              onChange={(e) => setIfscOrSwift(e.target.value)}
              placeholder="e.g. HDFC0001234"
              className={financeInputClassName}
            />
          </FormField>

          <FormField label="Currency">
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              placeholder="INR"
              className={cn(financeInputClassName, "uppercase")}
              maxLength={3}
            />
          </FormField>

          <FormField label="Opening balance">
            <input
              type="number"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              className={cn(financeInputClassName, "text-right")}
            />
          </FormField>

          <FormField label="Opening balance date">
            <input
              type="date"
              value={openingBalanceDate}
              onChange={(e) => setOpeningBalanceDate(e.target.value)}
              className={financeInputClassName}
            />
          </FormField>
        </FormGrid>

        <label className="mt-4 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--border-default)]"
          />
          Mark as primary settlement bank
        </label>
      </Modal>
    </>
  );
}
