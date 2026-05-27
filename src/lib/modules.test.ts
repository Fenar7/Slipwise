import { productModules } from "@/lib/modules";

describe("productModules", () => {
  it("keeps the salary slip module present in the product lineup", () => {
    const salaryModule = productModules.find(
      (module) => module.slug === "salary-slip",
    );

    expect(salaryModule).toMatchObject({
      slug: "salary-slip",
      name: "Salary Slip Generator",
      eyebrow: "People Ops",
    });
    expect(salaryModule?.highlights).toEqual([
      "Repeatable earning rows",
      "Live total summaries",
      "Optional bank and signature blocks",
    ]);
  });
});
