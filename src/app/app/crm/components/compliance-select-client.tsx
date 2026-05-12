"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ComplianceSelect } from "./compliance-select";
import { updateVendorCrmFields } from "../actions";

interface ComplianceSelectClientProps {
  vendorId: string;
  initialStatus: string;
}

export function ComplianceSelectClient({ vendorId, initialStatus }: ComplianceSelectClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();

  async function handleChange(value: string) {
    setStatus(value);
    startTransition(async () => {
      await updateVendorCrmFields(vendorId, {
        complianceStatus: value as Parameters<typeof updateVendorCrmFields>[1]["complianceStatus"],
      });
      router.refresh();
    });
  }

  return (
    <div className={isPending ? "opacity-60 transition-opacity" : ""}>
      <ComplianceSelect value={status} onChange={handleChange} />
    </div>
  );
}
