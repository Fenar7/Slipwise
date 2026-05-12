"use client";

import { useState, useEffect, useCallback } from "react";
import { useActiveOrg } from "@/hooks/use-active-org";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getSequenceSettings,
  initializeSequenceSettings,
  updateSequenceSettings,
  seedSequenceSetting,
  getSequenceHistory,
  getSupportOverview,
  runSequenceHealthCheck,
  diagnoseSequenceHealth,
} from "./actions";
import type { SequenceSettingsData } from "./actions";
import {
  SequenceBuilder,
  SequenceSummary,
  ContinuityBuilder,
} from "@/features/sequences/components/SequenceBuilder";
import { SequenceHistoryPanel } from "@/features/sequences/components/sequence-history-panel";
import {
  buildFormatString,
  parseFormatString,
  getDefaultBuilderConfig,
  derivePeriodicityFromFormat,
  renderPreview,
} from "@/features/sequences/builder";
import type { SequenceBuilderConfig } from "@/features/sequences/builder";
import { getDefaultSequenceConfig } from "@/features/sequences/default-config";
import type { SequenceSupportOverview } from "@/features/sequences/services/sequence-admin";
import type { SequenceDocumentType, HealthCheckReport, HealthCheckFailure } from "@/features/sequences/types";

export default function SequenceSettingsPage() {
  const { activeOrg, isLoading: isOrgLoading } = useActiveOrg();
  const [canEditSettings, setCanEditSettings] = useState<boolean | null>(null);
  // Derive owner status from server response first; fall back to client-side org
  // role because the server-side canEdit check can be out of sync after role changes.
  const isOwner =
    canEditSettings === true ||
    activeOrg?.role === "owner" ||
    activeOrg?.role === "OWNER";
  const editabilityKnown = canEditSettings !== null || activeOrg?.role != null;

  const [invoiceSettings, setInvoiceSettings] = useState<SequenceSettingsData | null>(null);
  const [voucherSettings, setVoucherSettings] = useState<SequenceSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"INVOICE" | "VOUCHER" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Builder state for editing
  const [editingType, setEditingType] = useState<"INVOICE" | "VOUCHER" | null>(null);
  const [invoiceBuilder, setInvoiceBuilder] = useState<SequenceBuilderConfig>(getDefaultBuilderConfig("INVOICE"));
  const [voucherBuilder, setVoucherBuilder] = useState<SequenceBuilderConfig>(getDefaultBuilderConfig("VOUCHER"));
  const [invoiceAdvanced, setInvoiceAdvanced] = useState(false);
  const [voucherAdvanced, setVoucherAdvanced] = useState(false);
  const [invoiceRawFormat, setInvoiceRawFormat] = useState("INV/{YYYY}/{NNNNN}");
  const [voucherRawFormat, setVoucherRawFormat] = useState("VCH/{YYYY}/{NNNNN}");
  const [invoiceSetupSeed, setInvoiceSetupSeed] = useState("");
  const [voucherSetupSeed, setVoucherSetupSeed] = useState("");

  // Continuity seed state
  const [seedDocType, setSeedDocType] = useState<SequenceDocumentType>("INVOICE");
  const [seedNumber, setSeedNumber] = useState("");
  const [seedLoading, setSeedLoading] = useState(false);

  // History state
  const [historyDocType, setHistoryDocType] = useState<SequenceDocumentType | "ALL">("ALL");
  const [history, setHistory] = useState<Array<{
    id: string;
    action: string;
    actor: { name: string } | null;
    createdAt: Date;
    metadata: unknown;
  }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Diagnostics state
  const [diagDocType, setDiagDocType] = useState<SequenceDocumentType>("INVOICE");
  const [diagLoading, setDiagLoading] = useState<"health" | "overview" | "diagnostics" | null>(null);
  const [healthReport, setHealthReport] = useState<HealthCheckReport | null>(null);
  const [supportOverview, setSupportOverview] = useState<SequenceSupportOverview | null>(null);
  const [diagResult, setDiagResult] = useState<{ gaps: number; irregularities: number; warnings: number; criticals: number } | null>(null);
  const [showAdvancedSection, setShowAdvancedSection] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!activeOrg?.id) {
      if (!isOrgLoading) {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    try {
      const data = await getSequenceSettings(activeOrg.id);
      setInvoiceSettings(data.invoice);
      setVoucherSettings(data.voucher);
      setCanEditSettings(data.canEdit);

      if (data.invoice?.formatString) {
        const parsed = parseFormatString(data.invoice.formatString, "INV");
        if (parsed) {
          setInvoiceBuilder(parsed);
          setInvoiceAdvanced(false);
        } else {
          setInvoiceAdvanced(true);
          setInvoiceRawFormat(data.invoice.formatString);
        }
      }
      if (data.voucher?.formatString) {
        const parsed = parseFormatString(data.voucher.formatString, "VCH");
        if (parsed) {
          setVoucherBuilder(parsed);
          setVoucherAdvanced(false);
        } else {
          setVoucherAdvanced(true);
          setVoucherRawFormat(data.voucher.formatString);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [activeOrg?.id, isOrgLoading]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const availableSeedDocTypes = [
    invoiceSettings ? "INVOICE" : null,
    voucherSettings ? "VOUCHER" : null,
  ].filter(Boolean) as SequenceDocumentType[];

  useEffect(() => {
    if (availableSeedDocTypes.length === 0) {
      return;
    }
    if (!availableSeedDocTypes.includes(seedDocType)) {
      setSeedDocType(availableSeedDocTypes[0]);
      setSeedNumber("");
    }
  }, [availableSeedDocTypes, seedDocType]);

  const handleSave = async (documentType: "INVOICE" | "VOUCHER") => {
    if (!activeOrg?.id || !isOwner) return;
    setSaving(documentType);
    setError(null);
    setSuccess(null);

    try {
      const isAdvanced = documentType === "INVOICE" ? invoiceAdvanced : voucherAdvanced;
      const rawOrBuilt = documentType === "INVOICE"
        ? (invoiceAdvanced ? invoiceRawFormat : buildFormatString(invoiceBuilder))
        : (voucherAdvanced ? voucherRawFormat : buildFormatString(voucherBuilder));
      const formatString = rawOrBuilt;
      const periodicity = isAdvanced
        ? derivePeriodicityFromFormat(formatString)
        : (documentType === "INVOICE" ? invoiceBuilder.resetCycle : voucherBuilder.resetCycle);

      await updateSequenceSettings(activeOrg.id, {
        documentType,
        formatString,
        periodicity,
      });

      setSuccess(
        `${documentType === "INVOICE" ? "Invoice" : "Voucher"} numbering updated successfully`
      );
      setEditingType(null);
      await loadSettings();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update sequence settings"
      );
    } finally {
      setSaving(null);
    }
  };

  const handleInitialize = async (
    documentType: "INVOICE" | "VOUCHER",
    mode: "defaults" | "custom"
  ) => {
    if (!activeOrg?.id || !isOwner) return;

    setSaving(documentType);
    setError(null);
    setSuccess(null);

    try {
      const isAdvanced = documentType === "INVOICE" ? invoiceAdvanced : voucherAdvanced;
      const builderConfig = documentType === "INVOICE" ? invoiceBuilder : voucherBuilder;
      const formatString = documentType === "INVOICE"
        ? (isAdvanced ? invoiceRawFormat : buildFormatString(invoiceBuilder))
        : (isAdvanced ? voucherRawFormat : buildFormatString(voucherBuilder));
      const periodicity = isAdvanced
        ? derivePeriodicityFromFormat(formatString)
        : builderConfig.resetCycle;
      const latestUsedNumber = documentType === "INVOICE"
        ? invoiceSetupSeed.trim() || undefined
        : voucherSetupSeed.trim() || undefined;

      await initializeSequenceSettings(activeOrg.id, {
        documentType,
        formatString: mode === "custom" ? formatString : undefined,
        periodicity: mode === "custom" ? periodicity : undefined,
        latestUsedNumber,
      });

      setSuccess(
        `${documentType === "INVOICE" ? "Invoice" : "Voucher"} numbering set up successfully`
      );
      setEditingType(null);
      if (documentType === "INVOICE") {
        setInvoiceSetupSeed("");
      } else {
        setVoucherSetupSeed("");
      }
      await loadSettings();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to initialize sequence settings"
      );
    } finally {
      setSaving(null);
    }
  };

  const getFormatString = (type: "INVOICE" | "VOUCHER") => {
    const settings = type === "INVOICE" ? invoiceSettings : voucherSettings;
    return settings?.formatString ?? (type === "INVOICE" ? "INV/{YYYY}/{NNNNN}" : "VCH/{YYYY}/{NNNNN}");
  };

  if (isOrgLoading || loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-md bg-[var(--surface-subtle)]" />
        <div className="h-32 animate-pulse rounded-md bg-[var(--surface-subtle)]" />
        <div className="h-32 animate-pulse rounded-md bg-[var(--surface-subtle)]" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {editabilityKnown && !isOwner && (
        <p className="text-sm text-[var(--text-muted)]">
          Only the organization owner can edit these settings.
        </p>
      )}

      {error && (
        <div className="rounded-md border border-[var(--state-danger)]/20 bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-[var(--state-success)]/20 bg-[var(--state-success-soft)] px-4 py-3 text-sm text-[var(--state-success)]">
          {success}
        </div>
      )}

      {/* ── Invoice Numbering ── */}
      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Invoice Numbering</h2>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              {invoiceSettings
                ? "Current invoice numbering configuration and next issued number."
                : "Set up how invoice numbers are generated and formatted."}
            </p>
          </div>
          {invoiceSettings && (
            <Badge variant={invoiceSettings.isActive ? "success" : "warning"}>
              {invoiceSettings.isActive ? "Active" : "Inactive"}
            </Badge>
          )}
        </div>

        {editingType === "INVOICE" ? (
          <div className="space-y-4">
            <SequenceBuilder
              documentType="INVOICE"
              config={invoiceBuilder}
              onChange={setInvoiceBuilder}
              rawFormat={invoiceRawFormat}
              onRawFormatChange={setInvoiceRawFormat}
              advancedMode={invoiceAdvanced}
              onAdvancedModeChange={setInvoiceAdvanced}
            />
            {!invoiceSettings && (
              <div className="border-t border-[var(--border-soft)] pt-4">
                <ContinuityBuilder
                  documentType="INVOICE"
                  formatString={invoiceAdvanced ? invoiceRawFormat : buildFormatString(invoiceBuilder)}
                  lastUsedNumber={invoiceSetupSeed}
                  onLastUsedNumberChange={setInvoiceSetupSeed}
                  showAction={false}
                />
              </div>
            )}
            {isOwner && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  onClick={() =>
                    invoiceSettings
                      ? handleSave("INVOICE")
                      : handleInitialize("INVOICE", "custom")
                  }
                  disabled={saving === "INVOICE"}
                  variant="primary"
                  size="sm"
                >
                  {saving === "INVOICE"
                    ? "Saving…"
                    : invoiceSettings
                      ? "Save changes"
                      : "Create numbering"}
                </Button>
                <Button
                  onClick={() => setEditingType(null)}
                  variant="ghost"
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        ) : invoiceSettings ? (
          <div className="space-y-4">
            <SequenceSummary
              documentType="INVOICE"
              config={invoiceBuilder}
              nextPreview={invoiceSettings.nextPreview}
              latestIssuedNumber={invoiceSettings.currentCounter}
              isActive={invoiceSettings.isActive}
            />
            {isOwner && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => { setEditingType("INVOICE"); setError(null); setSuccess(null); }} variant="secondary" size="sm">
                  Edit numbering
                </Button>
              </div>
            )}
            {invoiceSettings.sequenceId && activeOrg?.id && (
              <details className="group">
                <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                  <svg className="h-3.5 w-3.5 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  Version History
                </summary>
                <div className="mt-3">
                  <SequenceHistoryPanel orgId={activeOrg.id} sequenceId={invoiceSettings.sequenceId} />
                </div>
              </details>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <NotConfiguredState
              documentType="INVOICE"
              isOwner={isOwner}
              saving={saving === "INVOICE"}
              onUseDefaults={() => handleInitialize("INVOICE", "defaults")}
              onCustomize={() => { setEditingType("INVOICE"); setError(null); setSuccess(null); }}
            />
          </div>
        )}
      </section>

      {/* ── Voucher Numbering ── */}
      <section className="border-t border-[var(--border-soft)] pt-10 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Voucher Numbering</h2>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              {voucherSettings
                ? "Current voucher numbering configuration and next issued number."
                : "Set up how voucher numbers are generated and formatted."}
            </p>
          </div>
          {voucherSettings && (
            <Badge variant={voucherSettings.isActive ? "success" : "warning"}>
              {voucherSettings.isActive ? "Active" : "Inactive"}
            </Badge>
          )}
        </div>

        {editingType === "VOUCHER" ? (
          <div className="space-y-4">
            <SequenceBuilder
              documentType="VOUCHER"
              config={voucherBuilder}
              onChange={setVoucherBuilder}
              rawFormat={voucherRawFormat}
              onRawFormatChange={setVoucherRawFormat}
              advancedMode={voucherAdvanced}
              onAdvancedModeChange={setVoucherAdvanced}
            />
            {!voucherSettings && (
              <div className="border-t border-[var(--border-soft)] pt-4">
                <ContinuityBuilder
                  documentType="VOUCHER"
                  formatString={voucherAdvanced ? voucherRawFormat : buildFormatString(voucherBuilder)}
                  lastUsedNumber={voucherSetupSeed}
                  onLastUsedNumberChange={setVoucherSetupSeed}
                  showAction={false}
                />
              </div>
            )}
            {isOwner && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  onClick={() =>
                    voucherSettings
                      ? handleSave("VOUCHER")
                      : handleInitialize("VOUCHER", "custom")
                  }
                  disabled={saving === "VOUCHER"}
                  variant="primary"
                  size="sm"
                >
                  {saving === "VOUCHER"
                    ? "Saving…"
                    : voucherSettings
                      ? "Save changes"
                      : "Create numbering"}
                </Button>
                <Button
                  onClick={() => setEditingType(null)}
                  variant="ghost"
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        ) : voucherSettings ? (
          <div className="space-y-4">
            <SequenceSummary
              documentType="VOUCHER"
              config={voucherBuilder}
              nextPreview={voucherSettings.nextPreview}
              latestIssuedNumber={voucherSettings.currentCounter}
              isActive={voucherSettings.isActive}
            />
            {isOwner && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => { setEditingType("VOUCHER"); setError(null); setSuccess(null); }} variant="secondary" size="sm">
                  Edit numbering
                </Button>
              </div>
            )}
            {voucherSettings.sequenceId && activeOrg?.id && (
              <details className="group">
                <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                  <svg className="h-3.5 w-3.5 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  Version History
                </summary>
                <div className="mt-3">
                  <SequenceHistoryPanel orgId={activeOrg.id} sequenceId={voucherSettings.sequenceId} />
                </div>
              </details>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <NotConfiguredState
              documentType="VOUCHER"
              isOwner={isOwner}
              saving={saving === "VOUCHER"}
              onUseDefaults={() => handleInitialize("VOUCHER", "defaults")}
              onCustomize={() => { setEditingType("VOUCHER"); setError(null); setSuccess(null); }}
            />
          </div>
        )}
      </section>

      {/* ── Continue from existing numbers ── */}
      {isOwner && availableSeedDocTypes.length > 0 && (
        <section className="border-t border-[var(--border-soft)] pt-10 space-y-5">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Continue from existing numbers</h2>
          <p className="text-sm text-[var(--text-muted)]">
            If you are migrating from another system, set the last used number so Slipwise continues from the right place.
          </p>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-[var(--text-primary)]">Document type:</label>
              <select
                value={seedDocType}
                onChange={(e) => {
                  setSeedDocType(e.target.value as SequenceDocumentType);
                  setSeedNumber("");
                }}
                className="block w-40 rounded-md border border-[var(--border-soft)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
              >
                {invoiceSettings ? <option value="INVOICE">Invoice</option> : null}
                {voucherSettings ? <option value="VOUCHER">Voucher</option> : null}
              </select>
            </div>

            <ContinuityBuilder
              documentType={seedDocType}
              formatString={getFormatString(seedDocType)}
              lastUsedNumber={seedNumber}
              onLastUsedNumberChange={setSeedNumber}
              loading={seedLoading}
              onSeed={async () => {
                if (!activeOrg?.id) return;
                setSeedLoading(true);
                setError(null);
                setSuccess(null);
                try {
                  const result = await seedSequenceSetting(activeOrg.id, {
                    documentType: seedDocType,
                    latestUsedNumber: seedNumber,
                  });
                  setSuccess(
                    `${seedDocType === "INVOICE" ? "Invoice" : "Voucher"} continuity saved. Slipwise will next issue ${result.nextPreview}`
                  );
                  setSeedNumber("");
                  await loadSettings();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to save continuity");
                } finally {
                  setSeedLoading(false);
                }
              }}
            />
          </div>
        </section>
      )}

      {/* ── History and troubleshooting ── */}
      <section className="border-t border-[var(--border-soft)] pt-10 space-y-5">
        <button
          type="button"
          onClick={() => setShowAdvancedSection((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--text-secondary)] transition-colors"
        >
          <span>History and troubleshooting</span>
          <span className="text-lg leading-none">{showAdvancedSection ? "−" : "+"}</span>
        </button>

        {showAdvancedSection && (
          <div className="space-y-8">
            {isOwner && (
              <DiagnosticsSection
                orgId={activeOrg?.id ?? ""}
                docType={diagDocType}
                onDocTypeChange={setDiagDocType}
                loading={diagLoading}
                onSetLoading={setDiagLoading}
                healthReport={healthReport}
                onSetHealthReport={setHealthReport}
                supportOverview={supportOverview}
                onSetSupportOverview={setSupportOverview}
                diagResult={diagResult}
                onSetDiagResult={setDiagResult}
                onError={setError}
              />
            )}

            <HistorySection
              docType={historyDocType}
              onDocTypeChange={setHistoryDocType}
              loading={historyLoading}
              history={history}
              onLoad={async () => {
                if (!activeOrg?.id) return;
                setHistoryLoading(true);
                try {
                  const data = await getSequenceHistory(
                    activeOrg.id,
                    historyDocType === "ALL" ? undefined : historyDocType
                  );
                  setHistory(data.logs);
                } catch {
                  // ignore
                } finally {
                  setHistoryLoading(false);
                }
              }}
            />
          </div>
        )}
      </section>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

function NotConfiguredState({
  documentType,
  isOwner,
  saving,
  onUseDefaults,
  onCustomize,
}: {
  documentType: "INVOICE" | "VOUCHER";
  isOwner: boolean;
  saving: boolean;
  onUseDefaults: () => void;
  onCustomize: () => void;
}) {
  const recommended = getDefaultSequenceConfig(documentType);
  const recommendedPreview = renderPreview(recommended.formatString, recommended.startCounter);
  const noun = documentType === "INVOICE" ? "Invoice" : "Voucher";
  const nounPlural = documentType === "INVOICE" ? "Invoices" : "Vouchers";

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-subtle)]/40 p-4">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Recommended default
        </p>
        <p className="mt-2 text-sm text-[var(--text-primary)]">
          {nounPlural} will start as{" "}
          <span className="rounded border border-[var(--border-soft)] bg-white px-1.5 py-0.5 font-mono text-xs">
            {recommendedPreview ?? recommended.formatString}
          </span>{" "}
          and reset every year.
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          You can keep this recommended setup or customize the prefix, reset cycle, and number length.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {isOwner ? (
          <>
            <Button onClick={onUseDefaults} disabled={saving} variant="primary" size="sm">
              {saving ? "Setting up…" : `Set up ${noun.toLowerCase()} numbering`}
            </Button>
            <Button onClick={onCustomize} variant="secondary" size="sm">
              Customize
            </Button>
          </>
        ) : (
          <>
            <Button disabled variant="primary" size="sm">
              Set up {noun.toLowerCase()} numbering
            </Button>
            <p className="text-xs text-[var(--text-muted)]">
              Only the organization owner can configure numbering.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  warning: "bg-yellow-100 text-yellow-800 border-yellow-200",
};

function DiagnosticsSection({
  orgId,
  docType,
  onDocTypeChange,
  loading,
  onSetLoading,
  healthReport,
  onSetHealthReport,
  supportOverview,
  onSetSupportOverview,
  diagResult,
  onSetDiagResult,
  onError,
}: {
  orgId: string;
  docType: SequenceDocumentType;
  onDocTypeChange: (v: SequenceDocumentType) => void;
  loading: "health" | "overview" | "diagnostics" | null;
  onSetLoading: (v: "health" | "overview" | "diagnostics" | null) => void;
  healthReport: HealthCheckReport | null;
  onSetHealthReport: (v: HealthCheckReport | null) => void;
  supportOverview: SequenceSupportOverview | null;
  onSetSupportOverview: (v: SequenceSupportOverview | null) => void;
  diagResult: { gaps: number; irregularities: number; warnings: number; criticals: number } | null;
  onSetDiagResult: (v: { gaps: number; irregularities: number; warnings: number; criticals: number } | null) => void;
  onError: (v: string | null) => void;
}) {
  return (
    <div className="space-y-5">
      <h3 className="text-base font-semibold text-[var(--text-primary)]">Diagnostics &amp; Support</h3>
      <p className="text-sm text-[var(--text-muted)]">
        Investigate sequence health, current state, and irregularities.
      </p>

      <div className="flex items-center gap-2">
        <label className="text-sm text-[var(--text-muted)]">Document type:</label>
        <select
          value={docType}
          onChange={(e) => onDocTypeChange(e.target.value as SequenceDocumentType)}
          className="block w-32 rounded-md border border-[var(--border-soft)] bg-white px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
        >
          <option value="INVOICE">Invoice</option>
          <option value="VOUCHER">Voucher</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          size="sm"
          disabled={loading !== null}
          onClick={async () => {
            onSetLoading("health");
            onSetHealthReport(null);
            onError(null);
            try {
              const report = await runSequenceHealthCheck(orgId, docType);
              onSetHealthReport(report);
            } catch (err) {
              onError(err instanceof Error ? err.message : "Health check failed");
            } finally {
              onSetLoading(null);
            }
          }}
        >
          {loading === "health" ? "Running…" : "Run health check"}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          disabled={loading !== null}
          onClick={async () => {
            onSetLoading("overview");
            onSetSupportOverview(null);
            onSetDiagResult(null);
            onError(null);
            try {
              const overview = await getSupportOverview(orgId, docType);
              onSetSupportOverview(overview);
            } catch (err) {
              onError(err instanceof Error ? err.message : "Support overview failed");
            } finally {
              onSetLoading(null);
            }
          }}
        >
          {loading === "overview" ? "Loading…" : "Support overview"}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          disabled={loading !== null}
          onClick={async () => {
            onSetLoading("diagnostics");
            onSetDiagResult(null);
            onError(null);
            try {
              const now = new Date();
              const start = new Date(now.getFullYear() - 2, 0, 1);
              const result = await diagnoseSequenceHealth({
                orgId,
                documentType: docType,
                startDate: start,
                endDate: now,
              });
              onSetDiagResult(result.summary);
            } catch (err) {
              onError(err instanceof Error ? err.message : "Diagnostics failed");
            } finally {
              onSetLoading(null);
            }
          }}
        >
          {loading === "diagnostics" ? "Running…" : "Run diagnostics"}
        </Button>
      </div>

      {/* Health Check Results */}
      {healthReport && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-[var(--text-primary)]">Health check</h4>
            <Badge variant={healthReport.passed ? "success" : "warning"}>
              {healthReport.passed ? "Passed" : "Failed"}
            </Badge>
          </div>
          {healthReport.failures.length === 0 ? (
            <p className="text-sm text-green-700">All checks passed.</p>
          ) : (
            <div className="space-y-2">
              {healthReport.failures.map((f: HealthCheckFailure, i: number) => (
                <div
                  key={i}
                  className={`rounded-md border px-3 py-2 text-sm ${SEVERITY_COLORS[f.severity] ?? "bg-gray-100 border-gray-200"}`}
                >
                  <span className="font-medium capitalize">{f.severity}</span>: {f.message}
                  {f.count !== undefined && (
                    <span className="ml-2 text-xs opacity-70">({f.count})</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Support Overview */}
      {supportOverview && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-[var(--text-primary)]">Support overview</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[var(--text-muted)]">Sequence</p>
              <p className="font-medium text-[var(--text-primary)]">{supportOverview.name}</p>
            </div>
            <div>
              <p className="text-[var(--text-muted)]">Status</p>
              <Badge variant={supportOverview.isActive ? "success" : "warning"}>
                {supportOverview.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div>
              <p className="text-[var(--text-muted)]">Next preview</p>
              <p className="font-medium text-[var(--text-primary)]">{supportOverview.nextPreview ?? "—"}</p>
            </div>
            <div>
              <p className="text-[var(--text-muted)]">Finalized docs</p>
              <p className="font-medium text-[var(--text-primary)]">{supportOverview.totalFinalizedDocs}</p>
            </div>
            <div>
              <p className="text-[var(--text-muted)]">Periods</p>
              <p className="font-medium text-[var(--text-primary)]">
                {supportOverview.periodCount} ({supportOverview.openPeriodCount} open, {supportOverview.closedPeriodCount} closed)
              </p>
            </div>
            <div>
              <p className="text-[var(--text-muted)]">Resequence</p>
              <p className="font-medium text-[var(--text-primary)]">
                {supportOverview.resequenceCount > 0
                  ? `${supportOverview.resequenceCount} times (last: ${supportOverview.lastResequenceAt?.slice(0, 10) ?? "—"})`
                  : "Never"}
              </p>
            </div>
          </div>
          {supportOverview.periods.length > 0 && (
            <div className="mt-3">
              <p className="text-sm text-[var(--text-muted)] mb-2">Recent periods</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-soft)]">
                    <th className="text-left py-1 px-2 text-[var(--text-muted)] font-medium">Period</th>
                    <th className="text-left py-1 px-2 text-[var(--text-muted)] font-medium">Status</th>
                    <th className="text-left py-1 px-2 text-[var(--text-muted)] font-medium">Counter</th>
                  </tr>
                </thead>
                <tbody>
                  {supportOverview.periods.slice(0, 10).map((p) => (
                    <tr key={p.periodId} className="border-b border-[var(--border-soft)]">
                      <td className="py-1 px-2 text-[var(--text-primary)]">
                        {p.startDate} – {p.endDate}
                      </td>
                      <td className="py-1 px-2">
                        <Badge variant={p.status === "OPEN" ? "success" : "default"}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="py-1 px-2 text-[var(--text-primary)]">{p.currentCounter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Diagnostics Result */}
      {diagResult && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-[var(--text-primary)]">Gap &amp; irregularity diagnostics</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="bg-gray-50 rounded-md p-3 text-center">
              <p className="text-[var(--text-muted)]">Total docs</p>
              <p className="font-bold text-[var(--text-primary)] text-lg">{diagResult.irregularities + diagResult.warnings}</p>
            </div>
            <div className="bg-yellow-50 rounded-md p-3 text-center">
              <p className="text-[var(--text-muted)]">Gaps</p>
              <p className="font-bold text-yellow-700 text-lg">{diagResult.gaps}</p>
            </div>
            <div className="bg-orange-50 rounded-md p-3 text-center">
              <p className="text-[var(--text-muted)]">Warnings</p>
              <p className="font-bold text-orange-700 text-lg">{diagResult.warnings}</p>
            </div>
            <div className="bg-red-50 rounded-md p-3 text-center">
              <p className="text-[var(--text-muted)]">Criticals</p>
              <p className="font-bold text-red-700 text-lg">{diagResult.criticals}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

const ACTION_LABELS: Record<string, string> = {
  "sequence.created": "Created",
  "sequence.edited": "Edited",
  "sequence.periodicity_changed": "Periodicity changed",
  "sequence.future_activated": "Future format activated",
  "sequence.continuity_seeded": "Continuity seeded",
  "sequence.resequence_previewed": "Resequence previewed",
  "sequence.resequence_confirmed": "Resequence confirmed",
  "sequence.locked_attempt_blocked": "Locked period blocked",
};

function HistorySection({
  docType,
  onDocTypeChange,
  loading,
  history,
  onLoad,
}: {
  docType: SequenceDocumentType | "ALL";
  onDocTypeChange: (v: SequenceDocumentType | "ALL") => void;
  loading: boolean;
  history: Array<{
    id: string;
    action: string;
    actor: { name: string } | null;
    createdAt: Date;
    metadata: unknown;
  }>;
  onLoad: () => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-[var(--text-primary)]">Sequence history</h3>

      <div className="flex items-center gap-4">
        <label className="text-sm text-[var(--text-muted)]">Filter:</label>
        <select
          value={docType}
          onChange={(e) => onDocTypeChange(e.target.value as SequenceDocumentType | "ALL")}
          className="block w-40 rounded-md border border-[var(--border-soft)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
        >
          <option value="ALL">All</option>
          <option value="INVOICE">Invoice</option>
          <option value="VOUCHER">Voucher</option>
        </select>
        <Button
          onClick={onLoad}
          variant="secondary"
          size="sm"
        >
          {loading ? "Loading…" : "Load history"}
        </Button>
      </div>

      {loading && <p className="text-sm text-[var(--text-muted)]">Loading history…</p>}

      {history.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-soft)]">
                <th className="text-left py-2 px-3 text-[var(--text-muted)] font-medium">Time</th>
                <th className="text-left py-2 px-3 text-[var(--text-muted)] font-medium">Action</th>
                <th className="text-left py-2 px-3 text-[var(--text-muted)] font-medium">Actor</th>
                <th className="text-left py-2 px-3 text-[var(--text-muted)] font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id} className="border-b border-[var(--border-soft)]">
                  <td className="py-2 px-3 text-[var(--text-primary)] whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 px-3">
                    <Badge variant="default">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </Badge>
                  </td>
                  <td className="py-2 px-3 text-[var(--text-primary)]">{entry.actor?.name ?? "System"}</td>
                  <td className="py-2 px-3 text-[var(--text-muted)]">
                    {entry.metadata && typeof entry.metadata === "object" && entry.metadata !== null
                      ? Object.entries(entry.metadata as Record<string, unknown>)
                          .filter(([k]) => !k.includes("Id"))
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(", ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
