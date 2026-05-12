"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { toast } from "sonner";
import { BulkTagBar, BulkCheckbox } from "./bulk-tag-bar";
import {
  bulkAddInvoiceTags,
  bulkRemoveInvoiceTags,
} from "@/app/app/docs/invoices/actions";
import {
  bulkAddVoucherTags,
  bulkRemoveVoucherTags,
} from "@/app/app/docs/vouchers/actions";

interface BulkSelectContextValue {
  selectedIds: string[];
  toggleId: (id: string) => void;
  clearAll: () => void;
}

const BulkSelectContext = createContext<BulkSelectContextValue | null>(null);

export function useBulkSelectContext() {
  const ctx = useContext(BulkSelectContext);
  if (!ctx) return null;
  return ctx;
}

export function BulkSelectShell({
  children,
  entityType,
}: {
  children: ReactNode;
  entityType: "invoice" | "voucher";
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleId = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const clearAll = useCallback(() => setSelectedIds([]), []);

  const bulkAddAction =
    entityType === "invoice"
      ? async (ids: string[], tagId: string) => {
          const result = await bulkAddInvoiceTags(ids, tagId);
          if (result.success) return { success: true };
          return { success: false, error: result.error };
        }
      : async (ids: string[], tagId: string) => {
          const result = await bulkAddVoucherTags(ids, tagId);
          if (result.success) return { success: true };
          return { success: false, error: result.error };
        };

  const bulkRemoveAction =
    entityType === "invoice"
      ? async (ids: string[], tagId: string) => {
          const result = await bulkRemoveInvoiceTags(ids, tagId);
          if (result.success) return { success: true };
          return { success: false, error: result.error };
        }
      : async (ids: string[], tagId: string) => {
          const result = await bulkRemoveVoucherTags(ids, tagId);
          if (result.success) return { success: true };
          return { success: false, error: result.error };
        };

  return (
    <BulkSelectContext.Provider value={{ selectedIds, toggleId, clearAll }}>
      <div className="relative">
        {selectedIds.length > 0 && (
          <BulkTagBar
            selectedIds={selectedIds}
            onClearSelection={clearAll}
            entityType={entityType}
            bulkAddAction={bulkAddAction}
            bulkRemoveAction={bulkRemoveAction}
          />
        )}
        {children}
      </div>
    </BulkSelectContext.Provider>
  );
}

export { BulkCheckbox };
