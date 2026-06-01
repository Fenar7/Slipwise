import { useCallback, useRef } from "react";

export function useOverrideTracker(managedFieldKeys: readonly string[]) {
  const overridesRef = useRef<Record<string, boolean>>({});

  const markTouched = useCallback((fieldKey: string) => {
    if (managedFieldKeys.includes(fieldKey)) {
      overridesRef.current[fieldKey] = true;
    }
  }, [managedFieldKeys]);

  const isOverridden = useCallback((fieldKey: string): boolean => {
    return overridesRef.current[fieldKey] === true;
  }, []);

  const pruneNonOverridden = useCallback(
    <T extends Record<string, unknown>>(payload: T): Partial<T> => {
      const pruned: Partial<T> = {};
      for (const key of managedFieldKeys) {
        if (!overridesRef.current[key] && key in payload) {
          (pruned as Record<string, unknown>)[key] = payload[key];
        }
      }
      return pruned;
    },
    [managedFieldKeys],
  );

  const resetAll = useCallback(() => {
    overridesRef.current = {};
  }, []);

  return { markTouched, isOverridden, pruneNonOverridden, resetAll };
}
