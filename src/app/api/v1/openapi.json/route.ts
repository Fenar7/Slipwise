import { NextResponse } from "next/server";

const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Slipwise API",
    version: "1.0.0",
    description: "REST API for Slipwise — Invoice, Voucher, and Salary Slip management platform.",
    contact: { name: "Slipwise Support", url: "https://slipwise.in", email: "support@slipwise.in" },
  },
  servers: [{ url: "https://slipwise.in/api/v1", description: "Production" }],
  security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
  components: {
    securitySchemes: {
      BearerAuth: { type: "http", scheme: "bearer", description: "API key as Bearer token" },
      ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key", description: "API key via header" },
    },
    schemas: {
      SuccessResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", const: true },
          data: {},
          meta: { type: "object", properties: { page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" }, totalPages: { type: "integer" } } },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", const: false },
          error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } },
        },
      },
      Invoice: {
        type: "object",
        properties: {
          id: { type: "string" }, invoiceNumber: { type: "string", nullable: true }, invoiceDate: { type: "string" },
          dueDate: { type: "string", nullable: true }, status: { type: "string", enum: ["DRAFT", "ISSUED", "VIEWED", "DUE", "PARTIALLY_PAID", "PAID", "OVERDUE", "DISPUTED", "CANCELLED", "REISSUED"] },
          totalAmount: { type: "number" }, customerId: { type: "string", nullable: true }, notes: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
        },
      },
      InvoiceLineItem: {
        type: "object",
        properties: {
          id: { type: "string" }, description: { type: "string" }, quantity: { type: "number" },
          unitPrice: { type: "number" }, taxRate: { type: "number" }, discount: { type: "number" },
          amount: { type: "number" }, sortOrder: { type: "integer" },
        },
      },
      Customer: {
        type: "object",
        properties: {
          id: { type: "string" }, name: { type: "string" }, email: { type: "string", nullable: true },
          phone: { type: "string", nullable: true }, address: { type: "string", nullable: true },
          taxId: { type: "string", nullable: true }, gstin: { type: "string", nullable: true },
        },
      },
      Voucher: {
        type: "object",
        properties: {
          id: { type: "string" }, voucherNumber: { type: "string", nullable: true }, voucherDate: { type: "string" },
          type: { type: "string" }, status: { type: "string" }, totalAmount: { type: "number" },
          vendorId: { type: "string", nullable: true },
        },
      },
      SalarySlip: {
        type: "object",
        properties: {
          id: { type: "string" }, slipNumber: { type: "string" }, month: { type: "integer" },
          year: { type: "integer" }, status: { type: "string" }, grossPay: { type: "number" },
          netPay: { type: "number" }, employeeId: { type: "string", nullable: true },
        },
      },
      Employee: {
        type: "object",
        properties: {
          id: { type: "string" }, name: { type: "string" }, email: { type: "string", nullable: true },
          designation: { type: "string", nullable: true }, department: { type: "string", nullable: true },
        },
      },
      Vendor: {
        type: "object",
        properties: {
          id: { type: "string" }, name: { type: "string" }, email: { type: "string", nullable: true },
          phone: { type: "string", nullable: true }, gstin: { type: "string", nullable: true },
        },
      },
      MailboxConnectionListItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          orgId: { type: "string" },
          provider: { type: "string", enum: ["GMAIL", "ZOHO"] },
          emailAddress: { type: "string", format: "email" },
          displayName: { type: "string" },
          status: { type: "string", enum: ["ACTIVE", "DEGRADED", "DISCONNECTED", "RECONNECT_REQUIRED"] },
          visibilityPolicy: { type: "string", enum: ["org_shared", "restricted", "admin_only"] },
          notificationSettings: { type: "object", nullable: true, properties: { email: { type: "boolean" }, sms: { type: "boolean" } } },
          health: { type: "object", properties: { status: { type: "string" }, actionRequired: { type: "boolean" } } },
          lastSyncAt: { type: "string", format: "date-time", nullable: true },
          lastSyncError: { type: "string", nullable: true },
          connectedBy: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      CreateMailboxConnectionInput: {
        type: "object",
        required: ["provider", "emailAddress", "displayName", "providerAccountId", "tokenRef"],
        properties: {
          provider: { type: "string", enum: ["GMAIL", "ZOHO"] },
          emailAddress: { type: "string", format: "email" },
          displayName: { type: "string", minLength: 1, maxLength: 100 },
          visibilityPolicy: { type: "string", enum: ["org_shared", "restricted", "admin_only"], default: "org_shared" },
          notificationSettings: { type: "object", properties: { email: { type: "boolean" }, sms: { type: "boolean" } } },
          providerAccountId: { type: "string" },
          tokenRef: { type: "string" },
          tokenExpiry: { type: "string", format: "date-time", nullable: true },
        },
      },
      PatchMailboxConnectionInput: {
        type: "object",
        properties: {
          displayName: { type: "string", minLength: 1, maxLength: 100 },
          visibilityPolicy: { type: "string", enum: ["org_shared", "restricted", "admin_only"] },
          notificationSettings: { type: "object", properties: { email: { type: "boolean" }, sms: { type: "boolean" } } },
        },
      },
      PaginatedMailboxConnectionsResponse: {
        type: "object",
        properties: {
          connections: { type: "array", items: { $ref: "#/components/schemas/MailboxConnectionListItem" } },
          nextCursor: { type: "string", nullable: true, description: "Cursor for the next page. null when on the last page." },
        },
      },
      NewChatConnectionResponse: {
        type: "object",
        properties: {
          id: { type: "string" },
          displayName: { type: "string", description: "Auto-generated name (e.g. 'New Chat #3')" },
          visibilityPolicy: { type: "string", enum: ["org_shared", "restricted", "admin_only"] },
          notificationSettings: { type: "object", properties: { email: { type: "boolean" }, sms: { type: "boolean" } }, required: ["email", "sms"] },
        },
        required: ["id", "displayName", "visibilityPolicy", "notificationSettings"],
      },
      EmptyBody: {
        type: "object",
        description: "No payload required; strict mode rejects any keys.",
        additionalProperties: false,
      },
    },
    parameters: {
      PageParam: { name: "page", in: "query", schema: { type: "integer", default: 1, minimum: 1 } },
      LimitParam: { name: "limit", in: "query", schema: { type: "integer", default: 20, minimum: 1, maximum: 100 } },
    },
  },
  paths: {
    "/invoices": {
      get: {
        summary: "List invoices",
        tags: ["Invoices"],
        parameters: [
          { $ref: "#/components/parameters/PageParam" },
          { $ref: "#/components/parameters/LimitParam" },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "customerId", in: "query", schema: { type: "string" } },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
        ],
        responses: { "200": { description: "Paginated list of invoices" } },
      },
      post: {
        summary: "Create invoice",
        tags: ["Invoices"],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["invoiceDate"], properties: { invoiceNumber: { type: "string", nullable: true }, invoiceDate: { type: "string" }, dueDate: { type: "string" }, customerId: { type: "string" }, notes: { type: "string" }, lineItems: { type: "array", items: { $ref: "#/components/schemas/InvoiceLineItem" } } } } } } },
        responses: { "201": { description: "Invoice created" } },
      },
    },
    "/invoices/{id}": {
      get: { summary: "Get invoice", tags: ["Invoices"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Invoice with line items and payments" } } },
      patch: { summary: "Update invoice", tags: ["Invoices"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated invoice" } } },
      delete: { summary: "Delete invoice", tags: ["Invoices"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Invoice deleted" } } },
    },
    "/invoices/{id}/send": {
      post: { summary: "Send invoice", tags: ["Invoices"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Invoice status set to ISSUED" } } },
    },
    "/invoices/{id}/mark-paid": {
      post: { summary: "Mark invoice paid", tags: ["Invoices"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Payment recorded" } } },
    },
    "/invoices/{id}/payment-link": {
      post: { summary: "Create payment link", tags: ["Invoices"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Razorpay payment link created" } } },
    },
    "/vouchers": {
      get: { summary: "List vouchers", tags: ["Vouchers"], parameters: [{ $ref: "#/components/parameters/PageParam" }, { $ref: "#/components/parameters/LimitParam" }], responses: { "200": { description: "Paginated list" } } },
      post: { summary: "Create voucher", tags: ["Vouchers"], responses: { "201": { description: "Voucher created" } } },
    },
    "/vouchers/{id}": {
      get: { summary: "Get voucher", tags: ["Vouchers"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Voucher detail" } } },
      patch: { summary: "Update voucher", tags: ["Vouchers"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } },
      delete: { summary: "Delete voucher", tags: ["Vouchers"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Deleted" } } },
    },
    "/salary-slips": {
      get: { summary: "List salary slips", tags: ["Salary Slips"], parameters: [{ $ref: "#/components/parameters/PageParam" }, { $ref: "#/components/parameters/LimitParam" }], responses: { "200": { description: "Paginated list" } } },
      post: { summary: "Create salary slip", tags: ["Salary Slips"], responses: { "201": { description: "Salary slip created" } } },
    },
    "/salary-slips/{id}": {
      get: { summary: "Get salary slip", tags: ["Salary Slips"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Salary slip detail" } } },
      patch: { summary: "Update salary slip", tags: ["Salary Slips"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } },
      delete: { summary: "Delete salary slip", tags: ["Salary Slips"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Deleted" } } },
    },
    "/customers": {
      get: { summary: "List customers", tags: ["Customers"], parameters: [{ $ref: "#/components/parameters/PageParam" }, { $ref: "#/components/parameters/LimitParam" }, { name: "search", in: "query", schema: { type: "string" } }], responses: { "200": { description: "Paginated list" } } },
      post: { summary: "Create customer", tags: ["Customers"], responses: { "201": { description: "Customer created" } } },
    },
    "/customers/{id}": {
      get: { summary: "Get customer", tags: ["Customers"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Customer detail" } } },
      patch: { summary: "Update customer", tags: ["Customers"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } },
    },
    "/employees": {
      get: { summary: "List employees", tags: ["Employees"], parameters: [{ $ref: "#/components/parameters/PageParam" }, { $ref: "#/components/parameters/LimitParam" }, { name: "search", in: "query", schema: { type: "string" } }], responses: { "200": { description: "Paginated list" } } },
      post: { summary: "Create employee", tags: ["Employees"], responses: { "201": { description: "Employee created" } } },
    },
    "/employees/{id}": {
      get: { summary: "Get employee", tags: ["Employees"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Employee detail" } } },
      patch: { summary: "Update employee", tags: ["Employees"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } },
    },
    "/vendors": {
      get: { summary: "List vendors", tags: ["Vendors"], parameters: [{ $ref: "#/components/parameters/PageParam" }, { $ref: "#/components/parameters/LimitParam" }, { name: "search", in: "query", schema: { type: "string" } }], responses: { "200": { description: "Paginated list" } } },
      post: { summary: "Create vendor", tags: ["Vendors"], responses: { "201": { description: "Vendor created" } } },
    },
    "/vendors/{id}": {
      get: { summary: "Get vendor", tags: ["Vendors"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Vendor detail" } } },
      patch: { summary: "Update vendor", tags: ["Vendors"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } },
    },
    "/reports/summary": {
      get: { summary: "Get summary stats", tags: ["Reports"], responses: { "200": { description: "Aggregated dashboard statistics" } } },
    },
    "/reports/outstanding": {
      get: { summary: "Outstanding invoices by aging", tags: ["Reports"], responses: { "200": { description: "Aging report with buckets" } } },
    },
    "/mailbox/connections": {
      get: {
        summary: "List mailbox connections (paginated)",
        tags: ["Mailbox"],
        parameters: [
          { name: "cursor", in: "query", schema: { type: "string" }, description: "Opaque cursor (connection id) from the previous page" },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 }, description: "Results per page" },
        ],
        responses: {
          "200": { description: "Paginated list of mailbox connections", content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedMailboxConnectionsResponse" } } } },
          "400": { description: "Invalid query parameters" },
          "429": { description: "Rate limited" },
        },
      },
      post: {
        summary: "Create a mailbox connection (New Chat or provider-based)",
        tags: ["Mailbox"],
        description: "Two modes:\\n1. **New Chat** (empty body): creates a system chat with auto-generated name 'New Chat #&lt;seq&gt;', welcome message, and masked audit.\\n2. **Provider connection** (with provider, emailAddress, etc.): creates a real email connection.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                oneOf: [
                  { $ref: "#/components/schemas/EmptyBody" },
                  { $ref: "#/components/schemas/CreateMailboxConnectionInput" },
                ],
              },
            },
          },
        },
        responses: {
          "201": { description: "Connection created", headers: { Location: { schema: { type: "string" }, description: "URL of the created resource" } }, content: { "application/json": { schema: { oneOf: [{ $ref: "#/components/schemas/NewChatConnectionResponse" }, { type: "object", properties: { ok: { type: "boolean" }, connection: { $ref: "#/components/schemas/MailboxConnectionListItem" } } }] } } } },
          "400": { description: "Validation error (invalid body or unknown keys)" },
          "409": { description: "Duplicate displayName (provider flow only)" },
          "429": { description: "Rate limited (mailboxCreate: 5 req/min for New Chat; mailboxPolicyUpdate: 10 req/min for provider connections). Also returned if org has ≥1000 active connections." },
        },
      },
    },
    "/mailbox/connections/{connectionId}": {
      get: {
        summary: "Get mailbox connection detail",
        tags: ["Mailbox"],
        parameters: [{ name: "connectionId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Mailbox connection with sync runs", content: { "application/json": { schema: { type: "object", properties: { connection: { $ref: "#/components/schemas/MailboxConnectionListItem" } } } } } },
          "404": { description: "Not found" },
        },
      },
      patch: {
        summary: "Update mailbox connection settings",
        tags: ["Mailbox"],
        parameters: [{ name: "connectionId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/PatchMailboxConnectionInput" } } } },
        responses: {
          "200": { description: "Updated connection" },
          "400": { description: "Validation error or unknown fields" },
          "404": { description: "Not found" },
          "429": { description: "Rate limited" },
        },
      },
      delete: {
        summary: "Soft-delete a mailbox connection",
        tags: ["Mailbox"],
        parameters: [{ name: "connectionId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Connection soft-deleted (status=DISCONNECTED, deletedAt set)" },
          "404": { description: "Not found" },
          "409": { description: "Connection has active drafts; cannot delete" },
          "410": { description: "Already deleted" },
          "429": { description: "Rate limited" },
        },
      },
    },
  },
  tags: [
    { name: "Invoices", description: "Invoice management" },
    { name: "Vouchers", description: "Voucher management" },
    { name: "Salary Slips", description: "Salary slip management" },
    { name: "Customers", description: "Customer management" },
    { name: "Employees", description: "Employee management" },
    { name: "Vendors", description: "Vendor management" },
    { name: "Reports", description: "Reports and analytics" },
    { name: "Mailbox", description: "Mailbox connection management and governance" },
  ],
};

export async function GET() {
  return NextResponse.json(OPENAPI_SPEC, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
