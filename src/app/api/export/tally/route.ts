import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatIsoDate, toAccountingNumber } from "@/lib/accounting/utils";
import {
  batchInvoicesToTallyXML,
  invoiceToTallyXML,
  type InvoiceWithItems,
} from "@/lib/integrations/tally";

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      type?: string;
      ids?: string[];
    };

    if (!body.type || !Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json(
        { error: "type and ids[] are required" },
        { status: 400 }
      );
    }

    if (body.type !== "invoice" && body.type !== "voucher") {
      return NextResponse.json(
        { error: "type must be 'invoice' or 'voucher'" },
        { status: 400 }
      );
    }

    const invoices = await db.invoice.findMany({
      where: {
        id: { in: body.ids },
        organizationId: ctx.orgId,
      },
      include: {
        lineItems: true,
        customer: true,
        organization: { select: { name: true } },
      },
    });

    if (invoices.length === 0) {
      return NextResponse.json(
        { error: "No documents found" },
        { status: 404 }
      );
    }

    const mapped: InvoiceWithItems[] = invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber || "",
      invoiceDate: formatIsoDate(inv.invoiceDate),
      totalAmount: toAccountingNumber(inv.totalAmount),
      notes: inv.notes,
      formData: (inv.formData ?? {}) as Record<string, unknown>,
      lineItems: inv.lineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        taxRate: li.taxRate,
        discount: li.discount,
        amount: li.amount,
      })),
      customer: inv.customer
        ? { name: inv.customer.name, gstin: inv.customer.gstin ?? null }
        : null,
      organization: { name: inv.organization.name },
    }));

    const xml =
      mapped.length === 1
        ? invoiceToTallyXML(mapped[0])
        : batchInvoicesToTallyXML(mapped);

    const filename = `tally-export-${new Date().toISOString().slice(0, 10)}.xml`;

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Tally export failed:", error);
    return NextResponse.json(
      { error: "Export failed" },
      { status: 500 }
    );
  }
}
