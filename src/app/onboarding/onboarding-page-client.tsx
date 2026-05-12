"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthLogo } from "@/features/auth/components/auth-logo";
import { createOrg } from "@/app/app/actions/org-actions";
import {
  saveOnboardingBranding,
  saveOnboardingFinancials,
  saveOnboardingTemplates,
  saveOnboardingSequences,
} from "./actions";
import type { SequenceCustomConfig, OnboardingSequenceState } from "./actions";
import { SequenceBuilder, ContinuityBuilder } from "@/features/sequences/components/SequenceBuilder";
import {
  buildFormatString,
  parseFormatString,
  getDefaultBuilderConfig,
  derivePeriodicityFromFormat,
} from "@/features/sequences/builder";
import type { SequenceBuilderConfig } from "@/features/sequences/builder";
function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function OnboardingPageClient({
  orgId: initialOrgId,
  orgName: initialOrgName,
  sequenceState,
}: {
  orgId?: string;
  orgName?: string;
  sequenceState?: OnboardingSequenceState;
} = {}) {
  const router = useRouter();
  const isResuming = !!initialOrgId;

  // When resuming, we already have an org — skip to the numbering step.
  const startingStep = isResuming ? 5 : 1;
  const [step, setStep] = useState(startingStep);
  const [orgId, setOrgId] = useState(initialOrgId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1
  const [orgName, setOrgName] = useState(initialOrgName ?? "");
  const [industry, setIndustry] = useState("Freelance");

  // Step 2
  const [accentColor, setAccentColor] = useState("#dc2626");
  const [fontFamily, setFontFamily] = useState("Inter");

  // Step 3
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankIFSC, setBankIFSC] = useState("");
  const [taxId, setTaxId] = useState("");
  const [gstin, setGstin] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");

  // Step 4
  const [invoiceTemplate, setInvoiceTemplate] = useState("minimal");
  const [slipTemplate, setSlipTemplate] = useState("modern-premium");
  const [voucherTemplate, setVoucherTemplate] = useState("minimal-office");

  // Step 5 — Document Numbering
  // Derive initial values from hydrated sequence state for re-entry.
  const hasExistingConfig = !!(sequenceState?.invoice && sequenceState?.voucher);
  const hasPartialConfig =
    (sequenceState?.invoice && !sequenceState?.voucher) ||
    (!sequenceState?.invoice && sequenceState?.voucher);

  // When partial, detect whether the existing side is default or custom
  const existingPartialSide = hasPartialConfig
    ? (sequenceState?.invoice ? "INVOICE" : "VOUCHER")
    : null;
  const existingPartialConfig = existingPartialSide
    ? sequenceState?.invoice ?? sequenceState?.voucher
    : null;
  const partialIsDefault =
    existingPartialConfig?.formatString ===
      (existingPartialSide === "INVOICE" ? "INV/{YYYY}/{NNNNN}" : "VCH/{YYYY}/{NNNNN}") &&
    existingPartialConfig?.periodicity === "YEARLY";

  const isDefaultConfig =
    hasExistingConfig &&
    sequenceState?.invoice?.formatString === "INV/{YYYY}/{NNNNN}" &&
    sequenceState?.invoice?.periodicity === "YEARLY" &&
    sequenceState?.voucher?.formatString === "VCH/{YYYY}/{NNNNN}" &&
    sequenceState?.voucher?.periodicity === "YEARLY";

  const [sequenceMode, setSequenceMode] = useState<"defaults" | "custom">(
    (hasPartialConfig && !partialIsDefault) ? "custom"
    : (hasExistingConfig && !isDefaultConfig) ? "custom"
    : "defaults"
  );

  // Builder state for invoice
  const [invBuilder, setInvBuilder] = useState<SequenceBuilderConfig>(() => {
    if (sequenceState?.invoice?.formatString) {
      const parsed = parseFormatString(sequenceState.invoice.formatString, "INV");
      if (parsed) return parsed;
    }
    return getDefaultBuilderConfig("INVOICE");
  });
  const [invAdvanced, setInvAdvanced] = useState(false);
  const [invRawFormat, setInvRawFormat] = useState(
    sequenceState?.invoice?.formatString ?? "INV/{YYYY}/{NNNNN}"
  );
  const [invLatestUsed, setInvLatestUsed] = useState("");

  // Builder state for voucher
  const [vchBuilder, setVchBuilder] = useState<SequenceBuilderConfig>(() => {
    if (sequenceState?.voucher?.formatString) {
      const parsed = parseFormatString(sequenceState.voucher.formatString, "VCH");
      if (parsed) return parsed;
    }
    return getDefaultBuilderConfig("VOUCHER");
  });
  const [vchAdvanced, setVchAdvanced] = useState(false);
  const [vchRawFormat, setVchRawFormat] = useState(
    sequenceState?.voucher?.formatString ?? "VCH/{YYYY}/{NNNNN}"
  );
  const [vchLatestUsed, setVchLatestUsed] = useState("");

  const slug = slugify(orgName);

  async function handleStep1() {
    if (!orgName.trim()) {
      setError("Organization name is required");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const org = await createOrg({
        name: orgName.trim(),
        slug,
      });
      setOrgId(org.id);
      if (typeof window !== "undefined") {
        localStorage.setItem("slipwise_active_org_id", org.id);
      }
      setStep(2);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("session expired") || msg.toLowerCase().includes("sign in")) {
        setError("Your session expired. Please sign in again.");
      } else if (msg.includes("Unique") || msg.includes("unique") || msg.includes("slug")) {
        setError("An organization with that name already exists. Try a different name.");
      } else {
        setError("Could not create organization. Please try again.");
      }
      console.error("[createOrg error]", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleStep2() {
    setLoading(true);
    try {
      if (orgId) await saveOnboardingBranding({ organizationId: orgId, accentColor, fontFamily });
      setStep(3);
    } finally {
      setLoading(false);
    }
  }

  async function handleStep3() {
    setError("");
    setLoading(true);
    try {
      if (orgId)
        await saveOnboardingFinancials({
          organizationId: orgId,
          bankName,
          bankAccount,
          bankIFSC,
          taxId,
          gstin,
          businessAddress,
        });
      setStep(4);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Could not save financial details. Please try again.");
      console.error("[saveOnboardingFinancials error]", err);
    } finally {
      setLoading(false);
    }
  }

  function handleSkipStep3() {
    setError("");
    setStep(4);
  }

  async function handleStep4() {
    setLoading(true);
    try {
      if (orgId)
        await saveOnboardingTemplates({
          organizationId: orgId,
          invoiceTemplate,
          slipTemplate,
          voucherTemplate,
        });
      setStep(5);
    } finally {
      setLoading(false);
    }
  }

  async function handleStep5() {
    setError("");
    setLoading(true);
    try {
      if (orgId) {
        if (sequenceMode === "custom") {
          const customConfigs: SequenceCustomConfig[] = [
            {
              documentType: "INVOICE",
              formatString: invAdvanced ? invRawFormat : buildFormatString(invBuilder),
              periodicity: invAdvanced
                ? derivePeriodicityFromFormat(invRawFormat)
                : invBuilder.resetCycle,
              latestUsedNumber: invLatestUsed.trim() || undefined,
            },
            {
              documentType: "VOUCHER",
              formatString: vchAdvanced ? vchRawFormat : buildFormatString(vchBuilder),
              periodicity: vchAdvanced
                ? derivePeriodicityFromFormat(vchRawFormat)
                : vchBuilder.resetCycle,
              latestUsedNumber: vchLatestUsed.trim() || undefined,
            },
          ];
          await saveOnboardingSequences({ organizationId: orgId, customConfigs });
        } else {
          await saveOnboardingSequences({ organizationId: orgId });
        }
      }
      setStep(6);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Could not save document numbering. Please try again.");
      console.error("[saveOnboardingSequences error]", err);
    } finally {
      setLoading(false);
    }
  }

  /**
   * When the user already has both sequences configured and re-enters
   * onboarding, confirm the step without recreating.
   */
  async function handleConfirmExisting() {
    setError("");
    setLoading(true);
    try {
      if (orgId) {
        await saveOnboardingSequences({ organizationId: orgId });
      }
      setStep(6);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Could not confirm document numbering. Please try again.");
      console.error("[handleConfirmExisting error]", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="mb-8">
        <AuthLogo />
      </div>

      {step < 6 && (
        <div className="w-full max-w-[480px] mb-6">
          <div className="flex justify-between text-xs mb-2" style={{ color: "#79747E" }}>
            <span>Step {step} of 5</span>
            <span>{["Org Setup", "Branding", "Financials", "Templates", "Numbering"][step - 1]}</span>
          </div>
          <div className="h-1 rounded-full" style={{ background: "#E0E0E0" }}>
            <div
              className="h-1 bg-[#dc2626] rounded-full transition-all duration-300"
              style={{ width: `${step * 20}%` }}
            />
          </div>
        </div>
      )}

      <div className="w-full max-w-[480px] bg-white border rounded-2xl p-8" style={{ borderColor: "#E0E0E0" }}>
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold" style={{ color: "#1C1B1F" }}>Set up your organization</h2>
            <p className="text-sm" style={{ color: "#49454F" }}>
              This is how your team and clients will identify you.
            </p>
            <Input
              label="Organization name"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Corp"
              required
            />
            {orgName && (
              <p className="text-xs" style={{ color: "#79747E" }}>
                Slug: <span className="font-mono" style={{ color: "#1C1B1F" }}>{slug}</span>
              </p>
            )}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "#1C1B1F" }}>Industry</label>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
                style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
              >
                {["Freelance", "Agency", "Startup", "Enterprise", "Other"].map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button
              className="h-11 w-full rounded-xl"
              onClick={handleStep1}
              disabled={loading || !orgName.trim()}
            >
              {loading ? "Creating…" : "Continue →"}
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold" style={{ color: "#1C1B1F" }}>Brand identity</h2>
            <p className="text-sm" style={{ color: "#49454F" }}>Customize how your documents look to clients.</p>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "#1C1B1F" }}>Accent color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer border"
                  style={{ borderColor: "#E0E0E0" }}
                />
                <span className="text-sm font-mono" style={{ color: "#49454F" }}>{accentColor}</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "#1C1B1F" }}>Font family</label>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
                style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
              >
                {["Inter", "Roboto", "Poppins", "Playfair Display"].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="h-11 flex-1 rounded-xl" onClick={() => setStep(1)}>
                ← Back
              </Button>
              <Button className="h-11 flex-1 rounded-xl" onClick={handleStep2} disabled={loading}>
                {loading ? "Saving…" : "Continue →"}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold" style={{ color: "#1C1B1F" }}>Financial details</h2>
            <p className="text-sm" style={{ color: "#49454F" }}>
              Pre-fill your documents. You can edit or skip these now.
            </p>
            <Input
              label="Bank name"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="State Bank of India"
            />
            <Input
              label="Account number"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
            />
            <Input
              label="IFSC code"
              value={bankIFSC}
              onChange={(e) => setBankIFSC(e.target.value)}
            />
            <Input
              label="Tax ID / PAN"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
            />
            <Input label="GSTIN" value={gstin} onChange={(e) => setGstin(e.target.value)} />
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "#1C1B1F" }}>
                Business address
              </label>
              <textarea
                value={businessAddress}
                onChange={(e) => setBusinessAddress(e.target.value)}
                rows={3}
                className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#DC2626] resize-none"
                style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
                placeholder="123 Main St, Mumbai 400001"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <Button variant="secondary" className="h-11 flex-1 rounded-xl" onClick={() => setStep(2)}>
                ← Back
              </Button>
              <Button className="h-11 flex-1 rounded-xl" onClick={handleStep3} disabled={loading}>
                {loading ? "Saving…" : "Continue →"}
              </Button>
            </div>
            <button
              type="button"
              onClick={handleSkipStep3}
              className="w-full text-sm transition-colors hover:text-[#49454F]"
              style={{ color: "#79747E" }}
            >
              Skip for now
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold" style={{ color: "#1C1B1F" }}>Default templates</h2>
            <p className="text-sm" style={{ color: "#49454F" }}>
              Pick the templates your documents will default to.
            </p>
            <TemplateRadio
              label="Invoice template"
              options={["minimal", "professional", "classic"]}
              value={invoiceTemplate}
              onChange={setInvoiceTemplate}
            />
            <TemplateRadio
              label="Salary slip template"
              options={["modern-premium", "classic", "minimal"]}
              value={slipTemplate}
              onChange={setSlipTemplate}
            />
            <TemplateRadio
              label="Voucher template"
              options={["minimal-office", "corporate"]}
              value={voucherTemplate}
              onChange={setVoucherTemplate}
            />
            <div className="flex gap-3">
              <Button variant="secondary" className="h-11 flex-1 rounded-xl" onClick={() => setStep(3)}>
                ← Back
              </Button>
              <Button className="h-11 flex-1 rounded-xl" onClick={handleStep4} disabled={loading}>
                {loading ? "Saving…" : "Continue →"}
              </Button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold" style={{ color: "#1C1B1F" }}>Document Numbering</h2>
            <p className="text-sm" style={{ color: "#49454F" }}>
              Choose how invoice and voucher numbers look. You can change these later
              in settings.
            </p>

            {hasExistingConfig && !hasPartialConfig && (
              <div className="rounded-xl border p-4 space-y-2" style={{ background: "#F5F5F5", borderColor: "#E0E0E0" }}>
                <p className="text-sm font-medium" style={{ color: "#1C1B1F" }}>
                  Numbering already configured
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-white rounded-lg border p-2" style={{ borderColor: "#E0E0E0" }}>
                    <p className="text-xs" style={{ color: "#79747E" }}>Invoice</p>
                    <p className="font-mono text-xs" style={{ color: "#1C1B1F" }}>
                      {sequenceState?.invoice?.formatString ?? "—"}
                    </p>
                    <p className="text-xs" style={{ color: "#79747E" }}>{sequenceState?.invoice?.periodicity ?? "—"}</p>
                  </div>
                  <div className="bg-white rounded-lg border p-2" style={{ borderColor: "#E0E0E0" }}>
                    <p className="text-xs" style={{ color: "#79747E" }}>Voucher</p>
                    <p className="font-mono text-xs" style={{ color: "#1C1B1F" }}>
                      {sequenceState?.voucher?.formatString ?? "—"}
                    </p>
                    <p className="text-xs" style={{ color: "#79747E" }}>{sequenceState?.voucher?.periodicity ?? "—"}</p>
                  </div>
                </div>
                <p className="text-xs" style={{ color: "#49454F" }}>
                  Click Confirm and continue to complete this step. You can change these in Settings later.
                </p>
              </div>
            )}

            {hasPartialConfig && (
              <div className="rounded-xl border p-3 space-y-3" style={{ background: "#FFF8E1", borderColor: "#FFC107" }}>
                <p className="text-sm" style={{ color: "#7A5C00" }}>
                  One document type is already configured, the other is missing. The
                  existing configuration is shown below — complete the missing type to
                  finish.
                </p>
                {existingPartialConfig && (
                  <div className="bg-white rounded-lg border p-2 text-sm" style={{ borderColor: "#E0E0E0" }}>
                    <p className="text-xs" style={{ color: "#79747E" }}>
                      {existingPartialSide} (already configured)
                    </p>
                    <p className="font-mono text-xs" style={{ color: "#1C1B1F" }}>
                      {existingPartialConfig.formatString}
                    </p>
                    <p className="text-xs" style={{ color: "#79747E" }}>{existingPartialConfig.periodicity}</p>
                  </div>
                )}
                {!sequenceState?.invoice && (
                  <OnboardingSequenceSection
                    documentType="INVOICE"
                    builderConfig={invBuilder}
                    onBuilderChange={setInvBuilder}
                    rawFormat={invRawFormat}
                    onRawFormatChange={setInvRawFormat}
                    advancedMode={invAdvanced}
                    onAdvancedModeChange={setInvAdvanced}
                    latestUsed={invLatestUsed}
                    onLatestUsedChange={setInvLatestUsed}
                  />
                )}
                {!sequenceState?.voucher && (
                  <OnboardingSequenceSection
                    documentType="VOUCHER"
                    builderConfig={vchBuilder}
                    onBuilderChange={setVchBuilder}
                    rawFormat={vchRawFormat}
                    onRawFormatChange={setVchRawFormat}
                    advancedMode={vchAdvanced}
                    onAdvancedModeChange={setVchAdvanced}
                    latestUsed={vchLatestUsed}
                    onLatestUsedChange={setVchLatestUsed}
                  />
                )}
              </div>
            )}

            {!hasExistingConfig && !hasPartialConfig && (
              <div className="space-y-3">
                <label className="text-sm font-medium" style={{ color: "#1C1B1F" }}>Numbering mode</label>
                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={() => setSequenceMode("defaults")}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                      sequenceMode === "defaults"
                        ? "border-[#DC2626] bg-red-50 text-[#1C1B1F]"
                        : "border-[#E0E0E0] bg-white text-[#49454F] hover:border-[#DC2626]"
                    }`}
                  >
                    <span className="font-medium">Use recommended defaults</span>
                    <span className="block text-xs mt-0.5" style={{ color: "#79747E" }}>
                      Invoice: INV/2026/00001 · Voucher: VCH/2026/00001
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSequenceMode("custom")}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                      sequenceMode === "custom"
                        ? "border-[#DC2626] bg-red-50 text-[#1C1B1F]"
                        : "border-[#E0E0E0] bg-white text-[#49454F] hover:border-[#DC2626]"
                    }`}
                  >
                    <span className="font-medium">Customize numbering</span>
                    <span className="block text-xs mt-0.5" style={{ color: "#79747E" }}>
                      Choose your own prefix, reset cycle, and number length
                    </span>
                  </button>
                </div>
              </div>
            )}

            {sequenceMode === "defaults" && !hasExistingConfig && !hasPartialConfig && (
              <div className="rounded-xl border p-4 space-y-3" style={{ background: "#F5F5F5", borderColor: "#E0E0E0" }}>
                <p className="text-sm font-medium" style={{ color: "#1C1B1F" }}>Default sequences</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E0E0E0" }}>
                    <p style={{ color: "#49454F" }}>Invoice format</p>
                    <p className="font-mono" style={{ color: "#1C1B1F" }}>INV/&#123;YYYY&#125;/&#123;NNNNN&#125;</p>
                    <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>Resets yearly, starts at 1</p>
                  </div>
                  <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E0E0E0" }}>
                    <p style={{ color: "#49454F" }}>Voucher format</p>
                    <p className="font-mono" style={{ color: "#1C1B1F" }}>VCH/&#123;YYYY&#125;/&#123;NNNNN&#125;</p>
                    <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>Resets yearly, starts at 1</p>
                  </div>
                </div>
              </div>
            )}

            {sequenceMode === "custom" && !hasExistingConfig && !hasPartialConfig && (
              <div className="space-y-4">
                <OnboardingSequenceSection
                  documentType="INVOICE"
                  builderConfig={invBuilder}
                  onBuilderChange={setInvBuilder}
                  rawFormat={invRawFormat}
                  onRawFormatChange={setInvRawFormat}
                  advancedMode={invAdvanced}
                  onAdvancedModeChange={setInvAdvanced}
                  latestUsed={invLatestUsed}
                  onLatestUsedChange={setInvLatestUsed}
                />
                <div className="border-t" style={{ borderColor: "#E0E0E0" }} />
                <OnboardingSequenceSection
                  documentType="VOUCHER"
                  builderConfig={vchBuilder}
                  onBuilderChange={setVchBuilder}
                  rawFormat={vchRawFormat}
                  onRawFormatChange={setVchRawFormat}
                  advancedMode={vchAdvanced}
                  onAdvancedModeChange={setVchAdvanced}
                  latestUsed={vchLatestUsed}
                  onLatestUsedChange={setVchLatestUsed}
                />
              </div>
            )}

            {error && (
              <div className="rounded-xl border px-3 py-2 text-sm text-red-700" style={{ background: "#F9DEDC", borderColor: "#F2B8B5" }}>
                {error}
              </div>
            )}
            <div className="flex gap-3">
              {!isResuming && (
                <Button variant="secondary" className="h-11 flex-1 rounded-xl" onClick={() => setStep(4)}>
                  ← Back
                </Button>
              )}
              <Button
                className="h-11 flex-1 rounded-xl"
                onClick={hasExistingConfig ? handleConfirmExisting : handleStep5}
                disabled={loading}
              >
                {loading ? "Saving…" : hasExistingConfig ? "Confirm & continue →" : "Finish setup →"}
              </Button>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="text-center space-y-5">
            <AnimatedCheckmark />
            <h2 className="text-xl font-semibold" style={{ color: "#1C1B1F" }}>You&apos;re all set!</h2>
            <p className="text-sm" style={{ color: "#49454F" }}>
              Your workspace is ready. Start creating professional documents.
            </p>
            <ul className="text-sm text-left space-y-2.5 rounded-xl border p-4" style={{ color: "#49454F", background: "#F5F5F5", borderColor: "#E0E0E0" }}>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#DC2626]" />
                Organization created
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#DC2626]" />
                Brand identity configured
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#DC2626]" />
                Financial details saved
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#DC2626]" />
                Default templates selected
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#DC2626]" />
                Document numbering configured
              </li>
            </ul>
            <Button className="h-11 w-full rounded-xl" onClick={() => router.push("/app/home")}>
              Go to dashboard →
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function AnimatedCheckmark() {
  return (
    <div className="relative mx-auto h-16 w-16">
      <svg className="h-full w-full" viewBox="0 0 52 52">
        <circle
          cx="26"
          cy="26"
          r="24"
          fill="none"
          stroke="#DC2626"
          strokeWidth="2"
          className="checkmark-circle"
        />
        <path
          fill="none"
          stroke="#DC2626"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14 27 L22 35 L38 16"
          className="checkmark-check"
        />
      </svg>
      <style>{`
        .checkmark-circle {
          stroke-dasharray: 166;
          stroke-dashoffset: 166;
          transform-origin: 50% 50%;
          animation: checkmark-stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards,
                     checkmark-scale 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.1s forwards;
        }
        .checkmark-check {
          stroke-dasharray: 48;
          stroke-dashoffset: 48;
          animation: checkmark-stroke 0.4s cubic-bezier(0.65, 0, 0.45, 1) 0.55s forwards;
        }
        @keyframes checkmark-stroke {
          100% { stroke-dashoffset: 0; }
        }
        @keyframes checkmark-scale {
          0%   { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function TemplateRadio({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2" style={{ color: "#1C1B1F" }}>{label}</label>
      <div className="grid gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
              value === opt
                ? "border-[#DC2626] bg-red-50 text-[#1C1B1F]"
                : "border-[#E0E0E0] bg-white text-[#49454F] hover:border-[#DC2626]"
            }`}
          >
            <span className="font-medium capitalize">{opt.replace(/-/g, " ")}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function OnboardingSequenceSection({
  documentType,
  builderConfig,
  onBuilderChange,
  rawFormat,
  onRawFormatChange,
  advancedMode,
  onAdvancedModeChange,
  latestUsed,
  onLatestUsedChange,
}: {
  documentType: "INVOICE" | "VOUCHER";
  builderConfig: SequenceBuilderConfig;
  onBuilderChange: (c: SequenceBuilderConfig) => void;
  rawFormat: string;
  onRawFormatChange: (v: string) => void;
  advancedMode: boolean;
  onAdvancedModeChange: (v: boolean) => void;
  latestUsed: string;
  onLatestUsedChange: (v: string) => void;
}) {
  const formatString = useMemo(
    () => (advancedMode ? rawFormat : buildFormatString(builderConfig)),
    [advancedMode, rawFormat, builderConfig]
  );

  const docLabel = documentType === "INVOICE" ? "Invoice" : "Voucher";

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>{docLabel} Numbering</h3>

      <SequenceBuilder
        documentType={documentType}
        config={builderConfig}
        onChange={onBuilderChange}
        rawFormat={rawFormat}
        onRawFormatChange={onRawFormatChange}
        advancedMode={advancedMode}
        onAdvancedModeChange={onAdvancedModeChange}
      />

      <div className="border-t pt-4" style={{ borderColor: "#E0E0E0" }}>
        <ContinuityBuilder
          documentType={documentType}
          formatString={formatString}
          lastUsedNumber={latestUsed}
          onLastUsedNumberChange={onLatestUsedChange}
          showAction={false}
        />
      </div>
    </div>
  );
}
