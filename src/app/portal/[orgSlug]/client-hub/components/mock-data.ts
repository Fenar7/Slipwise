/**
 * Phase 1 Sprint 1.3 — explicit static mock data for the Client Hub public shell.
 * All fixtures are local to this shell and clearly labeled as mock data.
 */

export interface MockInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  totalAmount: number;
  remainingAmount: number;
  status: string;
  description?: string;
}

export interface MockQuote {
  id: string;
  quoteNumber: string;
  title: string;
  issueDate: string;
  validUntil: string;
  totalAmount: number;
  status: string;
  canRespond: boolean;
}

export interface MockPayment {
  id: string;
  invoiceNumber: string;
  amount: number;
  paidAt: string;
  method: string;
  status: string;
}

export interface MockProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  unit: string;
}

export const MOCK_INVOICES: MockInvoice[] = [
  {
    id: "inv-001",
    invoiceNumber: "INV-2026-001",
    invoiceDate: "15 May 2026",
    dueDate: "30 May 2026",
    totalAmount: 45000,
    remainingAmount: 45000,
    status: "ISSUED",
    description: "Monthly consulting services",
  },
  {
    id: "inv-002",
    invoiceNumber: "INV-2026-002",
    invoiceDate: "01 May 2026",
    dueDate: "15 May 2026",
    totalAmount: 28000,
    remainingAmount: 0,
    status: "PAID",
    description: "Design system engagement",
  },
  {
    id: "inv-003",
    invoiceNumber: "INV-2026-003",
    invoiceDate: "10 Apr 2026",
    dueDate: "25 Apr 2026",
    totalAmount: 125000,
    remainingAmount: 75000,
    status: "PARTIALLY_PAID",
    description: "Quarterly platform retainer",
  },
];

export const MOCK_QUOTES: MockQuote[] = [
  {
    id: "qt-001",
    quoteNumber: "QT-2026-004",
    title: "Website Redesign Proposal",
    issueDate: "12 May 2026",
    validUntil: "12 Jun 2026",
    totalAmount: 85000,
    status: "SENT",
    canRespond: true,
  },
  {
    id: "qt-002",
    quoteNumber: "QT-2026-003",
    title: "SEO & Content Strategy",
    issueDate: "01 May 2026",
    validUntil: "01 Jun 2026",
    totalAmount: 35000,
    status: "ACCEPTED",
    canRespond: false,
  },
];

export const MOCK_PAYMENTS: MockPayment[] = [
  {
    id: "pay-001",
    invoiceNumber: "INV-2026-002",
    amount: 28000,
    paidAt: "10 May 2026",
    method: "Bank Transfer",
    status: "SETTLED",
  },
  {
    id: "pay-002",
    invoiceNumber: "INV-2026-003",
    amount: 50000,
    paidAt: "15 Apr 2026",
    method: "UPI",
    status: "SETTLED",
  },
];

export const MOCK_PRODUCTS: MockProduct[] = [
  {
    id: "prod-001",
    name: "Consulting Retainer",
    description: "Monthly strategic consulting and advisory services",
    price: 45000,
    unit: "month",
  },
  {
    id: "prod-002",
    name: "Design System Build",
    description: "End-to-end design system creation and documentation",
    price: 85000,
    unit: "project",
  },
  {
    id: "prod-003",
    name: "SEO & Content Strategy",
    description: "Search optimization and content planning",
    price: 35000,
    unit: "quarter",
  },
  {
    id: "prod-004",
    name: "Technical Audit",
    description: "Comprehensive infrastructure and code review",
    price: 25000,
    unit: "project",
  },
];

export function getMockInvoice(id: string): MockInvoice | undefined {
  return MOCK_INVOICES.find((inv) => inv.id === id);
}

export function getMockQuote(id: string): MockQuote | undefined {
  return MOCK_QUOTES.find((qt) => qt.id === id);
}

export const OUTSTANDING_BALANCE = 120000;
export const PENDING_INVOICES_COUNT = 2;
export const PENDING_QUOTES_COUNT = 1;
export const TOTAL_PAID = 78000;
