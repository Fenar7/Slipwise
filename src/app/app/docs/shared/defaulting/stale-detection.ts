import type { BaselineMetadata, StaleState } from "./types";
import { deterministicFingerprint } from "./fingerprint-utils";

export function checkStale(
  priorBaseline: BaselineMetadata | null,
  currentEntity: Record<string, unknown> | null,
  currentOrgDefaults: Record<string, unknown>,
  kind: "invoice" | "quote" | "voucher",
): StaleState {
  if (!priorBaseline) return { stale: false };

  const entityChanged = checkEntityStale(priorBaseline, currentEntity);
  const orgChanged = checkOrgDefaultsStale(priorBaseline, currentOrgDefaults);

  if (entityChanged && orgChanged) return { stale: true, source: "both" };
  if (entityChanged) return { stale: true, source: "entity" };
  if (orgChanged) return { stale: true, source: "orgDefaults" };
  return { stale: false };
}

function checkEntityStale(prior: BaselineMetadata, current: Record<string, unknown> | null): boolean {
  if (!prior.entityFingerprint) return false;
  if (!current) return prior.entityId !== null;
  const relevant = { name: current.name, email: current.email, phone: current.phone, address: current.address, gstin: current.gstin, taxId: current.taxId, paymentTermsDays: current.paymentTermsDays };
  return prior.entityFingerprint !== deterministicFingerprint(relevant as Record<string, unknown>);
}

function checkOrgDefaultsStale(prior: BaselineMetadata, current: Record<string, unknown>): boolean {
  if (!prior.orgDefaultsFingerprint) return false;
  const keys = managedOrgDefaultKeys(prior.kind);
  const subset: Record<string, unknown> = {};
  for (const k of keys) if (k in current) subset[k] = current[k];
  return prior.orgDefaultsFingerprint !== deterministicFingerprint(subset);
}

export function managedOrgDefaultKeys(kind: "invoice" | "quote" | "voucher"): string[] {
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

export function staleLabel(source: "entity" | "orgDefaults" | "both"): string {
  if (source === "entity") return "Client data changed since autofill";
  if (source === "orgDefaults") return "Organisation defaults changed since autofill";
  return "Client data and organisation defaults changed since autofill";
}
