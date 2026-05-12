import { describe, expect, it } from "vitest";
import { getNavigationContext } from "@/components/layout/navigation-context";

describe("getNavigationContext", () => {
  it("uses suite home routes for top-level switcher items", () => {
    const context = getNavigationContext("/app/docs/invoices/new");
    const docsItem = context.switcherItems.find((item) => item.suite === "docs");

    expect(docsItem?.href).toBe("/app/docs");
    expect(docsItem?.isActive).toBe(true);
  });

  it("builds readable breadcrumbs for nested workspace routes", () => {
    const context = getNavigationContext("/app/pay/dunning/sequences/new");

    expect(context.suiteLabel).toBe("Pay");
    expect(context.pageTitle).toBe("New");
    expect(context.breadcrumbs.map((crumb) => crumb.label)).toEqual([
      "Slipwise",
      "Pay",
      "Dunning",
      "Sequences",
      "New",
    ]);
  });

  it("collapses identifier-like path segments into a details breadcrumb", () => {
    const context = getNavigationContext("/app/books/inter-company/clzmtj65p0000m608f0t5d6h5");

    expect(context.pageTitle).toBe("Details");
    expect(context.breadcrumbs.at(-1)?.label).toBe("Details");
  });
});
