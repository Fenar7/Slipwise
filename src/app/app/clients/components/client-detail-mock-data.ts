// Sprint 1.2 static fixture: Client Detail workspace shell data.
// This is intentionally mock data for the Phase 1 static UX shell.
// It will be replaced by real data queries in later sprints.

import type { ClientWorkspaceRow } from "./client-workspace-mock-data";

export interface ClientDetail extends ClientWorkspaceRow {
  gstin: string;
  panNumber: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  billingAddress: string;
  taxId: string;
  preferredLanguage: string;
  tags: string[];
  assignedTo: string;
  createdAt: string;
  notes: string;
  // Contacts
  contacts: ClientContact[];
  // Financial summary
  totalInvoiced: number;
  totalPaid: number;
  lifetimeValue: number;
  // Portal readiness
  portalEnabled: boolean;
  portalLastAccessedAt?: string;
  portalAccessCount: number;
  // Documents
  recentInvoices: ClientDocumentSummary[];
  recentQuotes: ClientDocumentSummary[];
  // Activity
  recentActivity: ClientActivity[];
}

export interface ClientContact {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isPrimary: boolean;
}

export interface ClientDocumentSummary {
  id: string;
  number: string;
  status: string;
  amount: number;
  date: string;
}

export interface ClientActivity {
  id: string;
  type: "invoice" | "quote" | "payment" | "note" | "portal" | "lifecycle";
  description: string;
  date: string;
  actor?: string;
}

export const MOCK_CLIENT_DETAILS: Record<string, ClientDetail> = {
  cl_01: {
    id: "cl_01",
    name: "Acme Manufacturing Ltd",
    contactName: "Rajesh Kumar",
    email: "rajesh@acmemfg.in",
    phone: "+91 98765 43210",
    portalStatus: "enabled",
    lifecycleStage: "ACTIVE",
    outstandingBalance: 245000,
    invoiceCount: 12,
    quoteCount: 3,
    lastActivityAt: "2026-05-14T09:30:00Z",
    gstin: "27AABCU9603R1ZM",
    panNumber: "AABCU9603R",
    address: "42, Industrial Estate, Phase II",
    city: "Mumbai",
    state: "Maharashtra",
    postalCode: "400063",
    country: "India",
    billingAddress: "42, Industrial Estate, Phase II, Mumbai, Maharashtra 400063",
    taxId: "27AABCU9603R1ZM",
    preferredLanguage: "en",
    tags: ["manufacturing", "enterprise", "priority"],
    assignedTo: "Amit Sharma",
    createdAt: "2023-08-15T10:00:00Z",
    notes: "Key enterprise client. Prefer quarterly invoicing. GST compliant.",
    contacts: [
      {
        id: "c1",
        name: "Rajesh Kumar",
        email: "rajesh@acmemfg.in",
        phone: "+91 98765 43210",
        role: "Finance Head",
        isPrimary: true,
      },
      {
        id: "c2",
        name: "Sunita Patel",
        email: "sunita@acmemfg.in",
        phone: "+91 98765 43211",
        role: "Operations Manager",
        isPrimary: false,
      },
    ],
    totalInvoiced: 1850000,
    totalPaid: 1605000,
    lifetimeValue: 1850000,
    portalEnabled: true,
    portalLastAccessedAt: "2026-05-14T08:15:00Z",
    portalAccessCount: 47,
    recentInvoices: [
      { id: "inv_1", number: "INV-2026-0042", status: "ISSUED", amount: 125000, date: "2026-05-10" },
      { id: "inv_2", number: "INV-2026-0038", status: "PAID", amount: 89000, date: "2026-04-28" },
      { id: "inv_3", number: "INV-2026-0035", status: "OVERDUE", amount: 156000, date: "2026-04-15" },
    ],
    recentQuotes: [
      { id: "q_1", number: "QTE-2026-0012", status: "ACCEPTED", amount: 245000, date: "2026-05-08" },
      { id: "q_2", number: "QTE-2026-0009", status: "SENT", amount: 178000, date: "2026-04-22" },
    ],
    recentActivity: [
      { id: "a1", type: "portal", description: "Client accessed portal", date: "2026-05-14T08:15:00Z", actor: "Rajesh Kumar" },
      { id: "a2", type: "invoice", description: "Invoice INV-2026-0042 issued", date: "2026-05-10T14:30:00Z", actor: "Amit Sharma" },
      { id: "a3", type: "quote", description: "Quote QTE-2026-0012 accepted", date: "2026-05-08T11:00:00Z", actor: "Rajesh Kumar" },
      { id: "a4", type: "payment", description: "Payment received ₹89,000", date: "2026-04-30T09:00:00Z" },
      { id: "a5", type: "note", description: "Q2 review meeting scheduled", date: "2026-04-25T16:00:00Z", actor: "Amit Sharma" },
    ],
  },
  cl_02: {
    id: "cl_02",
    name: "Beta Logistics Pvt Ltd",
    contactName: "Priya Sharma",
    email: "priya@betalogistics.com",
    phone: "+91 99887 77665",
    portalStatus: "invited",
    lifecycleStage: "ACTIVE",
    outstandingBalance: 89000,
    invoiceCount: 8,
    quoteCount: 1,
    lastActivityAt: "2026-05-13T16:45:00Z",
    gstin: "29AAGCB1234A1Z5",
    panNumber: "AAGCB1234A",
    address: "88, Logistics Park, Whitefield",
    city: "Bangalore",
    state: "Karnataka",
    postalCode: "560066",
    country: "India",
    billingAddress: "88, Logistics Park, Whitefield, Bangalore, Karnataka 560066",
    taxId: "29AAGCB1234A1Z5",
    preferredLanguage: "en",
    tags: ["logistics", "mid-market"],
    assignedTo: "Priya Menon",
    createdAt: "2024-01-20T08:00:00Z",
    notes: "Growing mid-market client. Invoice promptly for cash flow.",
    contacts: [
      {
        id: "c1",
        name: "Priya Sharma",
        email: "priya@betalogistics.com",
        phone: "+91 99887 77665",
        role: "CEO",
        isPrimary: true,
      },
    ],
    totalInvoiced: 520000,
    totalPaid: 431000,
    lifetimeValue: 520000,
    portalEnabled: false,
    portalAccessCount: 0,
    recentInvoices: [
      { id: "inv_1", number: "INV-2026-0039", status: "ISSUED", amount: 45000, date: "2026-05-05" },
      { id: "inv_2", number: "INV-2026-0032", status: "PAID", amount: 67000, date: "2026-04-18" },
    ],
    recentQuotes: [
      { id: "q_1", number: "QTE-2026-0010", status: "SENT", amount: 120000, date: "2026-04-20" },
    ],
    recentActivity: [
      { id: "a1", type: "invoice", description: "Invoice INV-2026-0039 issued", date: "2026-05-05T10:00:00Z", actor: "Priya Menon" },
      { id: "a2", type: "lifecycle", description: "Client marked ACTIVE", date: "2026-04-01T09:00:00Z", actor: "Priya Menon" },
    ],
  },
};

export function getMockClientDetail(id: string): ClientDetail | undefined {
  return MOCK_CLIENT_DETAILS[id];
}
