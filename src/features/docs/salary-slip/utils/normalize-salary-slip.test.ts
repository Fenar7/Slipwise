import { salarySlipDefaultValues } from "@/features/docs/salary-slip/constants";
import { normalizeSalarySlip } from "@/features/docs/salary-slip/utils/normalize-salary-slip";

describe("normalizeSalarySlip", () => {
  it("computes salary totals and net salary words", () => {
    const document = normalizeSalarySlip(salarySlipDefaultValues);

    expect(document.title).toBe("Salary Slip");
    expect(document.totalEarnings).toBe(47500);
    expect(document.totalDeductions).toBe(2000);
    expect(document.netSalary).toBe(45500);
    expect(document.netSalaryInWords).toBe("Rupees forty-five thousand five hundred only");
  });

  it("prunes hidden optional sections from the normalized payload", () => {
    const document = normalizeSalarySlip({
      ...salarySlipDefaultValues,
      visibility: {
        ...salarySlipDefaultValues.visibility,
        showPan: false,
        showUan: false,
        showNotes: false,
        showBankDetails: false,
      },
    });

    expect(document.pan).toBeUndefined();
    expect(document.uan).toBeUndefined();
    expect(document.notes).toBeUndefined();
    expect(document.bankName).toBeUndefined();
    expect(document.bankAccountNumber).toBeUndefined();
    expect(document.bankIfsc).toBeUndefined();
  });
});
