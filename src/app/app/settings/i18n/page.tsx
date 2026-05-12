"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsCardContent,
  SettingsSectionHeader,
  SettingsFormField,
  SettingsSaveBar,
} from "@/components/settings/settings-primitives";
import {
  getOrgI18nSettings,
  updateOrgLanguageSettings,
  updateOrgCountrySettings,
} from "./actions";
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from "@/lib/currency/utils";
import { COUNTRY_CONFIGS, SUPPORTED_COUNTRIES } from "@/lib/currency/country-config";
import { Languages, Globe } from "lucide-react";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "de", label: "German" },
  { code: "ar", label: "Arabic" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
];

export default function I18nSettingsPage() {
  const [defaultLanguage, setDefaultLanguage] = useState("en");
  const [defaultDocLanguage, setDefaultDocLanguage] = useState("en");
  const [country, setCountry] = useState("IN");
  const [baseCurrency, setBaseCurrency] = useState<SupportedCurrency>("INR");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [vatRegNumber, setVatRegNumber] = useState("");
  const [vatRate, setVatRate] = useState("");
  const [fiscalYearStart, setFiscalYearStart] = useState("4");
  const [saving, setSaving] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await getOrgI18nSettings();
      if (cancelled) return;
      if (result.success) {
        setDefaultLanguage(result.data.defaultLanguage);
        setDefaultDocLanguage(result.data.defaultDocLanguage);
        setCountry(result.data.country);
        setBaseCurrency(result.data.baseCurrency as SupportedCurrency);
        setTimezone(result.data.timezone);
        setVatRegNumber(result.data.vatRegNumber ?? "");
        setVatRate(result.data.vatRate != null ? String(result.data.vatRate) : "");
        setFiscalYearStart(String(result.data.fiscalYearStart));
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  function handleCountryChange(code: string) {
    setCountry(code);
    const config = COUNTRY_CONFIGS[code];
    if (config) {
      setBaseCurrency(config.defaultCurrency);
      setTimezone(config.timezone);
      setFiscalYearStart(String(config.fiscalYearStart));
    }
  }

  async function handleSaveLanguage(e: React.FormEvent) {
    e.preventDefault();
    setSaving("language");
    setSuccess(null);
    setError(null);
    const result = await updateOrgLanguageSettings({
      defaultLanguage,
      defaultDocLanguage,
    });
    setSaving(null);
    if (result.success) {
      setSuccess("language");
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(result.error);
    }
  }

  async function handleSaveCountry(e: React.FormEvent) {
    e.preventDefault();
    setSaving("country");
    setSuccess(null);
    setError(null);
    const result = await updateOrgCountrySettings({
      country,
      baseCurrency,
      timezone,
      vatRegNumber: vatRegNumber || undefined,
      vatRate: vatRate ? Number(vatRate) : undefined,
      fiscalYearStart: Number(fiscalYearStart),
    });
    setSaving(null);
    if (result.success) {
      setSuccess("country");
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(result.error);
    }
  }

  if (loading) {
    return (
      <div className="slipwise-panel p-6">
        <p className="text-sm text-[var(--text-muted)]">Loading settings…</p>
      </div>
    );
  }

  const selectClass =
    "w-full rounded-lg border border-[var(--border-soft)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]";

  return (
    <div className="space-y-6 max-w-2xl">
      {error && (
        <div className="rounded-lg border border-[var(--state-danger)]/20 bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {error}
        </div>
      )}

      {/* Language Settings */}
      <SettingsCard>
        <SettingsCardHeader>
          <div className="flex items-center gap-2.5">
            <Languages className="h-4 w-4 text-[var(--brand-primary)]" />
            <SettingsSectionHeader
              title="Language Settings"
              description="Choose the language for the app interface and exported documents."
            />
          </div>
        </SettingsCardHeader>
        <SettingsCardContent>
          <form onSubmit={handleSaveLanguage} className="space-y-5">
            <SettingsFormField label="App UI Language">
              <select
                value={defaultLanguage}
                onChange={(e) => setDefaultLanguage(e.target.value)}
                className={selectClass}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </SettingsFormField>

            <SettingsFormField
              label="Document Language"
              hint="Language used for invoices, salary slips, and other PDF exports."
            >
              <select
                value={defaultDocLanguage}
                onChange={(e) => setDefaultDocLanguage(e.target.value)}
                className={selectClass}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </SettingsFormField>

            <SettingsSaveBar
              saving={saving === "language"}
              saved={success === "language"}
              saveLabel="Save language settings"
            />
          </form>
        </SettingsCardContent>
      </SettingsCard>

      {/* Country & Tax Configuration */}
      <SettingsCard>
        <SettingsCardHeader>
          <div className="flex items-center gap-2.5">
            <Globe className="h-4 w-4 text-[var(--brand-primary)]" />
            <SettingsSectionHeader
              title="Country & Tax Configuration"
              description="Set your operating country, currency, and tax defaults."
            />
          </div>
        </SettingsCardHeader>
        <SettingsCardContent>
          <form onSubmit={handleSaveCountry} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <SettingsFormField label="Country">
                <select
                  value={country}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  className={selectClass}
                >
                  {SUPPORTED_COUNTRIES.map((code) => (
                    <option key={code} value={code}>
                      {COUNTRY_CONFIGS[code].name}
                    </option>
                  ))}
                </select>
              </SettingsFormField>

              <SettingsFormField label="Base Currency">
                <select
                  value={baseCurrency}
                  onChange={(e) =>
                    setBaseCurrency(e.target.value as SupportedCurrency)
                  }
                  className={selectClass}
                >
                  {Object.entries(SUPPORTED_CURRENCIES).map(([code, info]) => (
                    <option key={code} value={code}>
                      {info.symbol} {info.name} ({code})
                    </option>
                  ))}
                </select>
              </SettingsFormField>
            </div>

            <SettingsFormField label="Timezone">
              <Input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="e.g. Asia/Kolkata"
              />
            </SettingsFormField>

            <div className="grid gap-5 sm:grid-cols-2">
              <SettingsFormField
                label="VAT / Tax Registration Number"
                hint={COUNTRY_CONFIGS[country]?.vatIdLabel ?? "Tax ID"}
              >
                <Input
                  value={vatRegNumber}
                  onChange={(e) => setVatRegNumber(e.target.value)}
                  placeholder="Enter registration number"
                />
              </SettingsFormField>

              <SettingsFormField label="VAT / Tax Rate (%)">
                <Input
                  type="number"
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value)}
                  placeholder="e.g. 5"
                />
              </SettingsFormField>
            </div>

            <SettingsFormField label="Fiscal Year Start Month">
              <select
                value={fiscalYearStart}
                onChange={(e) => setFiscalYearStart(e.target.value)}
                className={selectClass}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1).toLocaleString("en", {
                      month: "long",
                    })}
                  </option>
                ))}
              </select>
            </SettingsFormField>

            <SettingsSaveBar
              saving={saving === "country"}
              saved={success === "country"}
              saveLabel="Save country settings"
            />
          </form>
        </SettingsCardContent>
      </SettingsCard>
    </div>
  );
}
