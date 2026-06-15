import type {
  SalarySlipFormValues,
  SalarySlipTemplateId,
} from "@/features/docs/salary-slip/types";

export const salarySlipTemplateOptions: Array<{
  id: SalarySlipTemplateId;
  name: string;
  description: string;
}> = [
  {
    id: "corporate-clean",
    name: "Corporate Clean",
    description: "Balanced payroll hierarchy with a formal summary and crisp tables.",
  },
  {
    id: "modern-premium",
    name: "Modern Premium",
    description: "A more polished executive layout with stronger salary emphasis.",
  },
];

export const salarySlipDefaultValues: SalarySlipFormValues = {
  templateId: "corporate-clean",
  branding: {
    companyName: "Northfield Trading Co.",
    address: "18 Market Road, Kozhikode",
    email: "accounts@northfield.example",
    phone: "+91 98765 43210",
    accentColor: "#c69854",
    logoSize: 72,
    logoFit: "contain",
  },
  employeeName: "Arun Dev",
  employeeId: "EMP-041",
  department: "Operations",
  designation: "Site Coordinator",
  pan: "FJTPD2148Q",
  uan: "100458732145",
  payPeriodLabel: "March 2026",
  month: "March",
  year: "2026",
  payDate: "2026-03-31",
  workingDays: "31",
  paidDays: "30",
  leaveDays: "1",
  lossOfPayDays: "0",
  paymentMethod: "Bank transfer",
  bankName: "Federal Bank",
  bankAccountNumber: "XXXX2841",
  bankIfsc: "FDRL0001220",
  joiningDate: "2022-08-16",
  workLocation: "Kozhikode HQ",
  earnings: [
    { label: "Basic salary", amount: "32000" },
    { label: "House rent allowance", amount: "12000" },
    { label: "Travel allowance", amount: "3500" },
  ],
  deductions: [
    { label: "Provident fund", amount: "1800" },
    { label: "Professional tax", amount: "200" },
  ],
  notes: "Salary credited after attendance review and travel settlement reconciliation.",
  preparedBy: "Anita Thomas",
  visibility: {
    showAddress: true,
    showEmail: true,
    showPhone: true,
    showEmployeeId: true,
    showDepartment: true,
    showDesignation: true,
    showPan: true,
    showUan: true,
    showBankDetails: true,
    showJoiningDate: true,
    showWorkLocation: true,
    showAttendance: true,
    showNotes: true,
    showSignature: true,
  },
};
