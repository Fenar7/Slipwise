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
  clientName: string;
  fromName: string;
  lineItems: Array<{
    id: string;
    name: string;
    quantity: number;
    price: number;
  }>;
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
    invoiceNumber: "INV-000131",
    invoiceDate: "21 Oct 2025",
    dueDate: "24 Oct 2025",
    totalAmount: 1200,
    remainingAmount: 1200,
    status: "UNPAID",
    description: "LinkedIn Inbox Yearly",
    clientName: "Hadi Azeez",
    fromName: "Acme Corporation",
    lineItems: [
      {
        id: "line-001",
        name: "LinkedIn inbox yearly",
        quantity: 1,
        price: 1200,
      },
    ],
  },
  {
    id: "inv-002",
    invoiceNumber: "INV-000128",
    invoiceDate: "14 Oct 2025",
    dueDate: "18 Oct 2025",
    totalAmount: 3200,
    remainingAmount: 0,
    status: "PAID",
    description: "Automation retainer",
    clientName: "Hadi Azeez",
    fromName: "Acme Corporation",
    lineItems: [
      {
        id: "line-002",
        name: "Automation retainer",
        quantity: 1,
        price: 3200,
      },
    ],
  },
  {
    id: "inv-003",
    invoiceNumber: "INV-000124",
    invoiceDate: "05 Oct 2025",
    dueDate: "20 Oct 2025",
    totalAmount: 4400,
    remainingAmount: 1800,
    status: "PARTIALLY_PAID",
    description: "Lead generation setup",
    clientName: "Hadi Azeez",
    fromName: "Acme Corporation",
    lineItems: [
      {
        id: "line-003",
        name: "Lead generation setup",
        quantity: 1,
        price: 4400,
      },
    ],
  },
];

export const MOCK_QUOTES: MockQuote[] = [
  {
    id: "qt-001",
    quoteNumber: "QT-000084",
    title: "Outbound lead generation package",
    issueDate: "12 Oct 2025",
    validUntil: "12 Nov 2025",
    totalAmount: 2800,
    status: "SENT",
    canRespond: true,
  },
  {
    id: "qt-002",
    quoteNumber: "QT-000081",
    title: "Quarterly advisory sprint",
    issueDate: "01 Oct 2025",
    validUntil: "01 Nov 2025",
    totalAmount: 1600,
    status: "ACCEPTED",
    canRespond: false,
  },
];

export const MOCK_PAYMENTS: MockPayment[] = [
  {
    id: "pay-001",
    invoiceNumber: "INV-000128",
    amount: 3200,
    paidAt: "18 Oct 2025",
    method: "Bank Transfer",
    status: "SETTLED",
  },
  {
    id: "pay-002",
    invoiceNumber: "INV-000124",
    amount: 2600,
    paidAt: "10 Oct 2025",
    method: "Payment Link",
    status: "SETTLED",
  },
];

export const MOCK_PRODUCTS: MockProduct[] = [
  {
    id: "prod-001",
    name: "LinkedIn Inbox Yearly",
    description: "Managed outbound inbox operations and reply handling.",
    price: 1200,
    unit: "year",
  },
  {
    id: "prod-002",
    name: "Lead Generation Sprint",
    description: "List building, targeting, and campaign setup.",
    price: 2800,
    unit: "package",
  },
  {
    id: "prod-003",
    name: "Quarterly Advisory",
    description: "Strategy, analysis, and growth recommendations.",
    price: 1600,
    unit: "quarter",
  },
  {
    id: "prod-004",
    name: "Growth Ops Support",
    description: "Operational support for reporting and pipeline maintenance.",
    price: 900,
    unit: "month",
  },
];

export function getMockInvoice(id: string): MockInvoice | undefined {
  return MOCK_INVOICES.find((inv) => inv.id === id);
}

export function getMockQuote(id: string): MockQuote | undefined {
  return MOCK_QUOTES.find((qt) => qt.id === id);
}

export const OUTSTANDING_BALANCE = 3000;
export const PENDING_INVOICES_COUNT = 2;
export const PENDING_QUOTES_COUNT = 1;
export const TOTAL_PAID = 5800;
