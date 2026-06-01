import type { BaselineMetadata, StaleState } from "./types";
import { deterministicFingerprint } from "./fingerprint-utils";

function managedOrgDefaultKeys(kind: "invoice" | "quote" | "voucher"): string[] {
  const shared = ["gstin", "taxId", "bankName", "bankAccount", "bankIFSC", "businessAddress"];
  if (kind === "invoice") return [...shared, "defaultInvoiceTemplate", "defaultInvoiceNotes", "defaultInvoiceTerms", "defaultInvoiceAuthorizedBy"];
  if (kind === "voucher") return [...shared, "defaultVoucherTemplate", "defaultVoucherNotes", "defaultVoucherApprovedBy", "defaultVoucherReceivedBy", "defaultVoucherPaymentMode"];
  return ["defaultQuoteNotes", "defaultQuoteTerms", "quoteValidityDays"];
}

export function entityFingerprint(entity: Record<string, unknown>): string {
  return deterministicFingerprint({
    name: entity.name ?? "",
    email: entity.email ?? "",
    phone: entity.phone ?? "",
    address: entity.address ?? "",
    gstin: entity.gstin ?? "",
    taxId: entity.taxId ?? "",
    paymentTermsDays: entity.paymentTermsDays ?? 30,
  });
}

export function buildBaseline(
  resolution: { entity: Record<string, unknown> | null; orgDefaults: Record<string, unknown>; templateId: string },
  input: { kind: "invoice" | "quote" | "voucher"; entityId?: string },
): BaselineMetadata {
  return {
    resolvedAt: new Date().toISOString(),
    kind: input.kind,
    entityType: input.kind === "voucher" ? "vendor" : "customer",
    entityId: (resolution.entity?.id as string) ?? null,
    entityFingerprint: resolution.entity ? entityFingerprint(resolution.entity) : null,
    orgDefaultsFingerprint: deterministicFingerprint(
      Object.fromEntries(managedOrgDefaultKeys(input.kind).map((k) => [k, (resolution.orgDefaults as Record<string, unknown>)[k] ?? null])),
    ),
    templateId: resolution.templateId,
    managedFieldKeys: [],
  };
}

export function checkStale(
  priorBaseline: BaselineMetadata | null,
  currentEntity: Record<string, unknown> | null,
  currentOrgDefaults: Record<string, unknown>,
  kind: "invoice" | "quote" | "voucher",
): StaleState {
  if (!priorBaseline) return { stale: false };
  const entityChanged = priorBaseline.entityFingerprint !== null && currentEntity
    ? priorBaseline.entityFingerprint !== entityFingerprint(currentEntity)
    : priorBaseline.entityId !== null && !currentEntity;
  const orgChanged = priorBaseline.orgDefaultsFingerprint !== null
    ? priorBaseline.orgDefaultsFingerprint !== deterministicFingerprint(
        Object.fromEntries(managedOrgDefaultKeys(kind).map((k) => [k, currentOrgDefaults[k] ?? null])),
      )
    : false;
  if (entityChanged && orgChanged) return { stale: true, source: "both" };
  if (entityChanged) return { stale: true, source: "entity" };
  if (orgChanged) return { stale: true, source: "orgDefaults" };
  return { stale: false };
}

export function staleLabel(source: "entity" | "orgDefaults" | "both"): string {
  if (source === "entity") return "Client data changed since autofill";
  if (source === "orgDefaults") return "Organisation defaults changed since autofill";
  return "Client data and organisation defaults changed since autofill";
}
