"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LifecycleSelect } from "./lifecycle-select";
import { updateCustomerCrmFields } from "../actions";

interface LifecycleSelectClientProps {
  customerId: string;
  initialStage: string;
}

export function LifecycleSelectClient({ customerId, initialStage }: LifecycleSelectClientProps) {
  const router = useRouter();
  const [stage, setStage] = useState(initialStage);
  const [isPending, startTransition] = useTransition();

  async function handleChange(value: string) {
    setStage(value);
    startTransition(async () => {
      await updateCustomerCrmFields(customerId, {
        lifecycleStage: value as Parameters<typeof updateCustomerCrmFields>[1]["lifecycleStage"],
      });
      router.refresh();
    });
  }

  return (
    <div className={isPending ? "opacity-60 transition-opacity" : ""}>
      <LifecycleSelect value={stage} onChange={handleChange} />
    </div>
  );
}
