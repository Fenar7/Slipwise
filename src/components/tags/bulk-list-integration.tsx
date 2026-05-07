"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { BulkTagBar, BulkCheckbox } from "@/components/tags/bulk-tag-bar";
import {
  bulkAddInvoiceTags,
  bulkRemoveInvoiceTags,
} from "@/app/app/docs/invoices/actions";
import {
  bulkAddVoucherTags,
  bulkRemoveVoucherTags,
} from "@/app/app/docs/vouchers/actions";

interface BulkSelectContext {
  selectedIds: string[];
  toggleId: (id: string) => void;
  clearSelection: () => void;
}

export function useBulkSelect(initialIds: string[] = []): BulkSelectContext {
  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);

  const toggleId = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  return { selectedIds, toggleId, clearSelection };
}

export function InvoiceBulkBar({
  selectedIds,
  clearSelection,
}: {
  selectedIds: string[];
  clearSelection: () => void;
}) {
  return (
    <BulkTagBar
      selectedIds={selectedIds}
      onClearSelection={clearSelection}
      entityType="invoice"
      bulkAddAction={async (ids, tagId) => {
        const result = await bulkAddInvoiceTags(ids, tagId);
        if (result.success) {
          return { success: true };
        }
        return { success: false, error: result.error };
      }}
      bulkRemoveAction={async (ids, tagId) => {
        const result = await bulkRemoveInvoiceTags(ids, tagId);
        if (result.success) {
          return { success: true };
        }
        return { success: false, error: result.error };
      }}
    />
  );
}

export function VoucherBulkBar({
  selectedIds,
  clearSelection,
}: {
  selectedIds: string[];
  clearSelection: () => void;
}) {
  return (
    <BulkTagBar
      selectedIds={selectedIds}
      onClearSelection={clearSelection}
      entityType="voucher"
      bulkAddAction={async (ids, tagId) => {
        const result = await bulkAddVoucherTags(ids, tagId);
        if (result.success) {
          return { success: true };
        }
        return { success: false, error: result.error };
      }}
      bulkRemoveAction={async (ids, tagId) => {
        const result = await bulkRemoveVoucherTags(ids, tagId);
        if (result.success) {
          return { success: true };
        }
        return { success: false, error: result.error };
      }}
    />
  );
}
