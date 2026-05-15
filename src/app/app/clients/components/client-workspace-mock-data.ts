// Sprint 1.1 static fixture: Client Workspace shell data.
// This is intentionally mock data for the Phase 1 static UX shell.
// It will be replaced by real data queries in later sprints.

export type ClientFilter =
  | "all"
  | "active"
  | "prospect"
  | "at-risk"
  | "churned"
  | "portal-enabled"
  | "portal-disabled";

export interface ClientWorkspaceRow {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  portalStatus: "enabled" | "invited" | "disabled" | "ineligible";
  lifecycleStage:
    | "PROSPECT"
    | "QUALIFIED"
    | "NEGOTIATION"
    | "WON"
    | "ACTIVE"
    | "AT_RISK"
    | "CHURNED";
  outstandingBalance: number;
  invoiceCount: number;
  quoteCount: number;
  lastActivityAt: string; // ISO date
}

export const MOCK_CLIENTS: ClientWorkspaceRow[] = [
  {
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
  },
  {
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
  },
  {
    id: "cl_03",
    name: "Gamma Retail Solutions",
    contactName: "Arun Nair",
    email: "arun@gamma retail.in",
    phone: "+91 91234 56789",
    portalStatus: "disabled",
    lifecycleStage: "AT_RISK",
    outstandingBalance: 342000,
    invoiceCount: 18,
    quoteCount: 5,
    lastActivityAt: "2026-05-10T11:20:00Z",
  },
  {
    id: "cl_04",
    name: "Delta Construction Co",
    contactName: "Suresh Menon",
    email: "suresh@deltaconstruction.co.in",
    phone: "+91 97654 32109",
    portalStatus: "ineligible",
    lifecycleStage: "NEGOTIATION",
    outstandingBalance: 0,
    invoiceCount: 2,
    quoteCount: 6,
    lastActivityAt: "2026-05-12T14:00:00Z",
  },
  {
    id: "cl_05",
    name: "Epsilon Design Studio",
    contactName: "Ananya Iyer",
    email: "ananya@epsilon.design",
    phone: "+91 94444 55555",
    portalStatus: "enabled",
    lifecycleStage: "ACTIVE",
    outstandingBalance: 45000,
    invoiceCount: 5,
    quoteCount: 0,
    lastActivityAt: "2026-05-14T08:15:00Z",
  },
  {
    id: "cl_06",
    name: "Zeta Pharma Distributors",
    contactName: "Dr. Vikram Rao",
    email: "vikram@zetapharma.com",
    phone: "+91 98888 99999",
    portalStatus: "invited",
    lifecycleStage: "WON",
    outstandingBalance: 120000,
    invoiceCount: 9,
    quoteCount: 2,
    lastActivityAt: "2026-05-11T10:30:00Z",
  },
  {
    id: "cl_07",
    name: "Eta Software Solutions",
    contactName: "Kavita Reddy",
    email: "kavita@etasoft.in",
    phone: "+91 96666 77777",
    portalStatus: "enabled",
    lifecycleStage: "ACTIVE",
    outstandingBalance: 0,
    invoiceCount: 24,
    quoteCount: 4,
    lastActivityAt: "2026-05-14T13:00:00Z",
  },
  {
    id: "cl_08",
    name: "Theta Hospitality Group",
    contactName: "Rohan Mehta",
    email: "rohan@thetahospitality.com",
    phone: "+91 95555 44444",
    portalStatus: "disabled",
    lifecycleStage: "CHURNED",
    outstandingBalance: 67000,
    invoiceCount: 14,
    quoteCount: 1,
    lastActivityAt: "2026-04-28T09:00:00Z",
  },
  {
    id: "cl_09",
    name: "Iota EdTech Pvt Ltd",
    contactName: "Neha Gupta",
    email: "neha@iotaedtech.com",
    phone: "+91 93333 22222",
    portalStatus: "ineligible",
    lifecycleStage: "PROSPECT",
    outstandingBalance: 0,
    invoiceCount: 0,
    quoteCount: 2,
    lastActivityAt: "2026-05-08T15:45:00Z",
  },
  {
    id: "cl_10",
    name: "Kappa Industrial Supplies",
    contactName: "Deepak Joshi",
    email: "deepak@kappaindustrial.in",
    phone: "+91 92222 11111",
    portalStatus: "enabled",
    lifecycleStage: "ACTIVE",
    outstandingBalance: 178000,
    invoiceCount: 21,
    quoteCount: 7,
    lastActivityAt: "2026-05-13T11:10:00Z",
  },
];

export const LIFECYCLE_VARIANTS: Record<
  string,
  "default" | "success" | "warning" | "danger" | "info" | "neutral"
> = {
  PROSPECT: "neutral",
  QUALIFIED: "info",
  NEGOTIATION: "warning",
  WON: "success",
  ACTIVE: "success",
  AT_RISK: "warning",
  CHURNED: "danger",
};

export const PORTAL_STATUS_VARIANTS: Record<
  string,
  "default" | "success" | "warning" | "danger" | "info" | "neutral"
> = {
  enabled: "success",
  invited: "info",
  disabled: "neutral",
  ineligible: "warning",
};

export const PORTAL_STATUS_LABELS: Record<string, string> = {
  enabled: "Hub Active",
  invited: "Invite Sent",
  disabled: "Disabled",
  ineligible: "No Email",
};
