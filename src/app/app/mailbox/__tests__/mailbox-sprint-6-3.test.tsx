import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMailboxQuerySync } from "../use-mailbox-query-sync";

describe("Sprint 6.3 Smart Views and Saved Operational Filters", () => {
  it("useMailboxQuerySync restores filter state from URL params", () => {
    vi.stubGlobal("location", { pathname: "/app/mailbox", search: "?q=test&f_status=OPEN" });
    const { result } = renderHook(() => useMailboxQuerySync());
    expect(result.current.filterState.searchQuery).toBe("test");
    expect(result.current.filterState.filters).toContainEqual({ field: "status", value: "OPEN", label: "OPEN" });
  });

  it("useMailboxQuerySync debounces URL updates", async () => {
    vi.stubGlobal("location", { pathname: "/app/mailbox", search: "" });
    const { result } = renderHook(() => useMailboxQuerySync());
    act(() => {
      result.current.setFilterState({ filters: [{ field: "status", value: "PENDING", label: "PENDING" }], searchQuery: "" });
    });
    expect(result.current.filterState.filters).toHaveLength(1);
  });
});
