"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsCardContent,
  SettingsSectionHeader,
  SettingsFormField,
} from "@/components/settings/settings-primitives";
import {
  getPayrollSettings,
  updatePayrollSettings,
  type PayrollSettingsData,
} from "./actions";
import { Landmark, Percent, Receipt } from "lucide-react";

const PT_SLABS_MAHARASHTRA = [
  { upTo: 7500, ptMonthly: 0 },
  { upTo: 10000, ptMonthly: 175 },
  { upTo: null, ptMonthly: 200 },
];

export default function PayrollSettingsPage() {
  const [settings, setSettings] = useState<PayrollSettingsData>({
    pfEnabled: true,
    esiEnabled: true,
    defaultTaxRegime: "new",
    professionalTaxState: null,
    professionalTaxSlabs: [],
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPayrollSettings().then((result) => {
      if (result.success) setSettings(result.data);
      setLoading(false);
    });
  }, []);

  function handleApplyMaharashtraDefaults() {
    setSettings((prev) => ({
      ...prev,
      professionalTaxState: "MH",
      professionalTaxSlabs: PT_SLABS_MAHARASHTRA,
    }));
  }

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const result = await updatePayrollSettings(settings);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  if (loading) {
    return (
      <div className="slipwise-panel p-6">
        <p className="text-sm text-[var(--text-muted)]">Loading payroll settings…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Payroll Settings</h2>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Configure statutory deductions, tax regime, and professional tax slabs.
        </p>
      </div>

      {/* Statutory Deductions */}
      <SettingsCard>
        <SettingsCardHeader>
          <div className="flex items-center gap-2.5">
            <Landmark className="h-4 w-4 text-[var(--brand-primary)]" />
            <SettingsSectionHeader
              title="Statutory Deductions"
              description="Enable or disable mandatory deductions for salary slips."
            />
          </div>
        </SettingsCardHeader>
        <SettingsCardContent className="space-y-4">
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <div className="text-sm font-medium text-[var(--text-primary)]">Provident Fund (PF)</div>
              <div className="text-xs text-[var(--text-muted)]">
                12% employee + 13% employer on Basic (capped at ₹15,000 wage ceiling)
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.pfEnabled}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, pfEnabled: e.target.checked }))
              }
              className="h-5 w-5 rounded border-[var(--border-soft)] accent-[var(--brand-primary)]"
            />
          </label>

          <div className="border-t border-[var(--border-soft)]" />

          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <div className="text-sm font-medium text-[var(--text-primary)]">
                Employees&apos; State Insurance (ESI)
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                0.75% employee + 3.25% employer — applies when gross ≤ ₹21,000
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.esiEnabled}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  esiEnabled: e.target.checked,
                }))
              }
              className="h-5 w-5 rounded border-[var(--border-soft)] accent-[var(--brand-primary)]"
            />
          </label>
        </SettingsCardContent>
      </SettingsCard>

      {/* Tax Regime */}
      <SettingsCard>
        <SettingsCardHeader>
          <div className="flex items-center gap-2.5">
            <Percent className="h-4 w-4 text-[var(--brand-primary)]" />
            <SettingsSectionHeader
              title="Default Tax Regime (TDS)"
              description="Choose the default income tax regime for new employees."
            />
          </div>
        </SettingsCardHeader>
        <SettingsCardContent>
          <div className="flex gap-6">
            {(["new", "old"] as const).map((regime) => (
              <label key={regime} className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="taxRegime"
                  value={regime}
                  checked={settings.defaultTaxRegime === regime}
                  onChange={() =>
                    setSettings((prev) => ({
                      ...prev,
                      defaultTaxRegime: regime,
                    }))
                  }
                  className="h-4 w-4 accent-[var(--brand-primary)]"
                />
                <span className="text-sm font-medium text-[var(--text-primary)] capitalize">
                  {regime} Regime
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {regime === "new" ? "(Default — §115BAC)" : "(Deductions allowed)"}
                </span>
              </label>
            ))}
          </div>
        </SettingsCardContent>
      </SettingsCard>

      {/* Professional Tax */}
      <SettingsCard>
        <SettingsCardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Receipt className="h-4 w-4 text-[var(--brand-primary)]" />
              <SettingsSectionHeader
                title="Professional Tax (PT)"
                description="Configure state-specific PT slabs for monthly gross salary."
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleApplyMaharashtraDefaults}
            >
              Load Maharashtra Slabs
            </Button>
          </div>
        </SettingsCardHeader>
        <SettingsCardContent className="space-y-5">
          <SettingsFormField label="State Code">
            <input
              type="text"
              value={settings.professionalTaxState ?? ""}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  professionalTaxState: e.target.value || null,
                }))
              }
              className="w-32 rounded-lg border border-[var(--border-soft)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              placeholder="e.g. MH"
            />
          </SettingsFormField>

          <div>
            <span className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              PT Slabs (Monthly Gross → PT Amount)
            </span>
            <div className="space-y-2">
              {settings.professionalTaxSlabs.map((slab, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <span className="text-sm text-[var(--text-muted)] w-24">
                    Gross up to ₹
                  </span>
                  <input
                    type="number"
                    value={slab.upTo ?? ""}
                    onChange={(e) => {
                      const slabs = [...settings.professionalTaxSlabs];
                      slabs[idx] = {
                        ...slabs[idx],
                        upTo: e.target.value === "" ? null : Number(e.target.value),
                      };
                      setSettings((prev) => ({
                        ...prev,
                        professionalTaxSlabs: slabs,
                      }));
                    }}
                    className="rounded-lg border border-[var(--border-soft)] bg-white px-2 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                    placeholder="No limit"
                  />
                  <span className="text-sm text-[var(--text-muted)]">→ PT ₹</span>
                  <input
                    type="number"
                    value={slab.ptMonthly}
                    onChange={(e) => {
                      const slabs = [...settings.professionalTaxSlabs];
                      slabs[idx] = {
                        ...slabs[idx],
                        ptMonthly: Number(e.target.value),
                      };
                      setSettings((prev) => ({
                        ...prev,
                        professionalTaxSlabs: slabs,
                      }));
                    }}
                    className="rounded-lg border border-[var(--border-soft)] bg-white px-2 py-1.5 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const slabs = settings.professionalTaxSlabs.filter(
                        (_, i) => i !== idx
                      );
                      setSettings((prev) => ({
                        ...prev,
                        professionalTaxSlabs: slabs,
                      }));
                    }}
                    className="text-sm text-[var(--state-danger)] hover:text-[var(--state-danger)]/80 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    professionalTaxSlabs: [
                      ...prev.professionalTaxSlabs,
                      { upTo: null, ptMonthly: 0 },
                    ],
                  }))
                }
                className="text-sm font-medium text-[var(--brand-primary)] hover:underline"
              >
                + Add Slab
              </button>
            </div>
          </div>
        </SettingsCardContent>
      </SettingsCard>

      {error && (
        <div className="rounded-lg border border-[var(--state-danger)]/20 bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-lg border border-[var(--state-success)]/20 bg-[var(--state-success-soft)] px-4 py-3 text-sm text-[var(--state-success)]">
          Settings saved successfully.
        </div>
      )}

      <Button
        variant="primary"
        onClick={handleSave}
        disabled={isPending}
      >
        {isPending ? "Saving…" : "Save Settings"}
      </Button>
    </div>
  );
}
