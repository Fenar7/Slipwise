"use client";

import { BulkCheckbox } from "./bulk-tag-bar";
import { useBulkSelectContext } from "./bulk-select-shell";

export function SelectableRowCheckbox({ id }: { id: string }) {
  const ctx = useBulkSelectContext();
  if (!ctx) {
    // Not inside BulkSelectShell — render nothing (avoids broken layout)
    return null;
  }
  return (
    <BulkCheckbox
      id={id}
      selected={ctx.selectedIds.includes(id)}
      onToggle={ctx.toggleId}
    />
  );
}
