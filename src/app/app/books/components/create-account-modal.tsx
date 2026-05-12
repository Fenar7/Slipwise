"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { FormField, FormGrid, financeInputClassName } from "@/components/forms/form-primitives";
import { createChartAccount } from "../actions";

interface CreateAccountModalProps {
  parentOptions: Array<{
    id: string;
    code: string;
    name: string;
  }>;
}

function defaultNormalBalance(accountType: string) {
  switch (accountType) {
    case "LIABILITY":
    case "EQUITY":
    case "INCOME":
      return "CREDIT";
    default:
      return "DEBIT";
  }
}

export function CreateAccountModal({ parentOptions }: CreateAccountModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState("EXPENSE");
  const [normalBalance, setNormalBalance] = useState("DEBIT");
  const [parentId, setParentId] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setCode("");
    setName("");
    setAccountType("EXPENSE");
    setNormalBalance("DEBIT");
    setParentId("");
    setDescription("");
    setError(null);
  }

  function close() {
    setOpen(false);
    resetForm();
  }

  function submit() {
    setError(null);

    startTransition(async () => {
      const result = await createChartAccount({
        code,
        name,
        accountType: accountType as
          | "ASSET"
          | "LIABILITY"
          | "EQUITY"
          | "INCOME"
          | "EXPENSE"
          | "CONTRA",
        normalBalance: normalBalance as "DEBIT" | "CREDIT",
        parentId: parentId || undefined,
        description,
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
      <Button onClick={() => setOpen(true)}>New Account</Button>

      <Modal
        open={open}
        onClose={close}
        title="Create account"
        subtitle="Add a custom account under your SW Books chart of accounts."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={isPending}>
              {isPending ? "Creating..." : "Create Account"}
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
          <FormField label="Code" required>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. 6100"
              className={financeInputClassName}
            />
          </FormField>

          <FormField label="Name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Office Supplies"
              className={financeInputClassName}
            />
          </FormField>

          <FormField label="Account type" required>
            <select
              value={accountType}
              onChange={(e) => {
                const nextType = e.target.value;
                setAccountType(nextType);
                setNormalBalance(defaultNormalBalance(nextType));
              }}
              className={financeInputClassName}
            >
              <option value="ASSET">Asset</option>
              <option value="LIABILITY">Liability</option>
              <option value="EQUITY">Equity</option>
              <option value="INCOME">Income</option>
              <option value="EXPENSE">Expense</option>
              <option value="CONTRA">Contra</option>
            </select>
          </FormField>

          <FormField label="Normal balance" required>
            <select
              value={normalBalance}
              onChange={(e) => setNormalBalance(e.target.value)}
              className={financeInputClassName}
            >
              <option value="DEBIT">Debit</option>
              <option value="CREDIT">Credit</option>
            </select>
          </FormField>

          <FormField label="Parent account" className="md:col-span-2">
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className={financeInputClassName}
            >
              <option value="">No parent</option>
              {parentOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} — {account.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Description" className="md:col-span-2">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={financeInputClassName}
            />
          </FormField>
        </FormGrid>
      </Modal>
    </>
  );
}
