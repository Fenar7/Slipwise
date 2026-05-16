"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ClientHubConfig } from "./mock-config";

interface SectionProps {
  config: ClientHubConfig;
  onChange: (next: ClientHubConfig) => void;
}

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-[var(--text-primary)]">
        {label}
      </label>
      {children}
      {hint && <p className="text-[0.7rem] text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

function TextInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        "w-full rounded-lg border border-[var(--border-strong)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--muted-foreground)]",
        "focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--accent)]",
        disabled && "bg-[var(--surface-subtle)] cursor-not-allowed opacity-60"
      )}
    />
  );
}

function TextArea({
  id,
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      className={cn(
        "w-full rounded-lg border border-[var(--border-strong)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--muted-foreground)]",
        "focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--accent)] resize-y",
        disabled && "bg-[var(--surface-subtle)] cursor-not-allowed opacity-60"
      )}
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
          checked ? "bg-[var(--brand-cta)]" : "bg-[var(--border-default)]",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
            checked ? "translate-x-5" : "translate-x-1"
          )}
        />
      </button>
      <span className={cn("text-sm text-[var(--text-primary)]", disabled && "opacity-50")}>{label}</span>
    </label>
  );
}

function ColorSwatch({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const presets = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0d9488", "#1e293b", "#dc2626"];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => !disabled && onChange(color)}
          disabled={disabled}
          className={cn(
            "h-7 w-7 rounded-full border-2 transition-transform",
            value === color ? "border-[var(--text-primary)] scale-110" : "border-transparent hover:scale-105"
          )}
          style={{ backgroundColor: color }}
          aria-label={`Select color ${color}`}
        />
      ))}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-[var(--text-muted)]">Custom</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-7 w-7 cursor-pointer rounded border-0 p-0 disabled:opacity-50"
        />
      </div>
    </div>
  );
}

function ChipList({
  items,
  onChange,
  disabled,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--border-soft)] bg-[var(--surface-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)]"
          >
            {item}
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(items.filter((i) => i !== item))}
                className="ml-0.5 text-[var(--text-muted)] hover:text-[var(--state-danger)]"
                aria-label={`Remove ${item}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim()) {
                e.preventDefault();
                if (!items.includes(input.trim())) {
                  onChange([...items, input.trim()]);
                }
                setInput("");
              }
            }}
            placeholder="Add method and press Enter"
            className="flex-1 rounded-lg border border-[var(--border-strong)] bg-white px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
        </div>
      )}
    </div>
  );
}

export function BrandingSection({ config, onChange }: SectionProps) {
  const setBranding = (patch: Partial<typeof config.branding>) =>
    onChange({ ...config, branding: { ...config.branding, ...patch } });

  return (
    <div className="space-y-5">
      <SectionCard title="Brand Colors" description="Choose the accent color used across the client hub.">
        <Field label="Accent Color" htmlFor="accent-color">
          <ColorSwatch value={config.branding.accentColor} onChange={(v) => setBranding({ accentColor: v })} />
        </Field>
      </SectionCard>

      <SectionCard title="Logo & Assets" description="Upload your organization logo for the client hub header.">
        <Field label="Logo URL" htmlFor="logo-url" hint="Leave empty to use the organization initial avatar.">
          <TextInput
            id="logo-url"
            value={config.branding.logoUrl ?? ""}
            onChange={(v) => setBranding({ logoUrl: v || null })}
            placeholder="https://cdn.example.com/logo.png"
          />
        </Field>
      </SectionCard>

      <SectionCard title="White Label" description="Control Slipwise branding visibility in the client hub.">
        <Toggle
          checked={config.branding.removePoweredBy}
          onChange={(v) => setBranding({ removePoweredBy: v })}
          label="Hide 'Powered by Slipwise' footer"
        />
      </SectionCard>
    </div>
  );
}

export function HomeDashboardSection({ config, onChange }: SectionProps) {
  const setHome = (patch: Partial<typeof config.homeDashboard>) =>
    onChange({ ...config, homeDashboard: { ...config.homeDashboard, ...patch } });

  return (
    <div className="space-y-5">
      <SectionCard title="Hero Messaging" description="Welcome text shown at the top of the client dashboard.">
        <Field label="Hero Title" htmlFor="hero-title">
          <TextInput id="hero-title" value={config.homeDashboard.heroTitle} onChange={(v) => setHome({ heroTitle: v })} />
        </Field>
        <Field label="Hero Subtitle" htmlFor="hero-subtitle">
          <TextInput id="hero-subtitle" value={config.homeDashboard.heroSubtitle} onChange={(v) => setHome({ heroSubtitle: v })} />
        </Field>
        <Field label="Eyebrow Label" htmlFor="hero-welcome">
          <TextInput
            id="hero-welcome"
            value={config.homeDashboard.welcomeMessage}
            onChange={(v) => setHome({ welcomeMessage: v })}
            placeholder="Client Portal"
          />
        </Field>
      </SectionCard>

      <SectionCard title="Dashboard Cards" description="Toggle visibility of summary cards on the client dashboard.">
        <Toggle checked={config.homeDashboard.showOutstandingBalance} onChange={(v) => setHome({ showOutstandingBalance: v })} label="Show outstanding balance" />
        <Toggle checked={config.homeDashboard.showPendingInvoices} onChange={(v) => setHome({ showPendingInvoices: v })} label="Show pending invoices count" />
        <Toggle checked={config.homeDashboard.showPendingQuotes} onChange={(v) => setHome({ showPendingQuotes: v })} label="Show pending quotes count" />
        <Toggle checked={config.homeDashboard.showQuickActions} onChange={(v) => setHome({ showQuickActions: v })} label="Show quick action shortcuts" />
      </SectionCard>
    </div>
  );
}

export function InvoicesSection({ config, onChange }: SectionProps) {
  const setInvoices = (patch: Partial<typeof config.invoices>) =>
    onChange({ ...config, invoices: { ...config.invoices, ...patch } });

  return (
    <div className="space-y-5">
      <SectionCard title="Page Framing" description="Title and description for the invoices page.">
        <Field label="Page Title" htmlFor="inv-title">
          <TextInput id="inv-title" value={config.invoices.pageTitle} onChange={(v) => setInvoices({ pageTitle: v })} />
        </Field>
        <Field label="Page Description" htmlFor="inv-desc">
          <TextInput id="inv-desc" value={config.invoices.pageDescription} onChange={(v) => setInvoices({ pageDescription: v })} />
        </Field>
      </SectionCard>

      <SectionCard title="Actions" description="Toggle client-facing actions for invoices.">
        <Toggle checked={config.invoices.showDownloadAction} onChange={(v) => setInvoices({ showDownloadAction: v })} label="Show download button" />
        <Toggle checked={config.invoices.showPayAction} onChange={(v) => setInvoices({ showPayAction: v })} label="Show pay button" />
      </SectionCard>
    </div>
  );
}

export function QuotesSection({ config, onChange }: SectionProps) {
  const setQuotes = (patch: Partial<typeof config.quotes>) =>
    onChange({ ...config, quotes: { ...config.quotes, ...patch } });

  return (
    <div className="space-y-5">
      <SectionCard title="Page Framing" description="Title and description for the quotes page.">
        <Field label="Page Title" htmlFor="qt-title">
          <TextInput id="qt-title" value={config.quotes.pageTitle} onChange={(v) => setQuotes({ pageTitle: v })} />
        </Field>
        <Field label="Page Description" htmlFor="qt-desc">
          <TextInput id="qt-desc" value={config.quotes.pageDescription} onChange={(v) => setQuotes({ pageDescription: v })} />
        </Field>
      </SectionCard>

      <SectionCard title="Actions" description="Toggle client-facing actions for quotes.">
        <Toggle checked={config.quotes.showAcceptReject} onChange={(v) => setQuotes({ showAcceptReject: v })} label="Enable accept / decline buttons" />
        <Toggle checked={config.quotes.showDownloadAction} onChange={(v) => setQuotes({ showDownloadAction: v })} label="Show download button" />
      </SectionCard>
    </div>
  );
}

export function PaymentsSection({ config, onChange }: SectionProps) {
  const setPayments = (patch: Partial<typeof config.payments>) =>
    onChange({ ...config, payments: { ...config.payments, ...patch } });

  return (
    <div className="space-y-5">
      <SectionCard title="Page Framing" description="Title and description for the payments page.">
        <Field label="Page Title" htmlFor="pay-title">
          <TextInput id="pay-title" value={config.payments.pageTitle} onChange={(v) => setPayments({ pageTitle: v })} />
        </Field>
        <Field label="Page Description" htmlFor="pay-desc">
          <TextInput id="pay-desc" value={config.payments.pageDescription} onChange={(v) => setPayments({ pageDescription: v })} />
        </Field>
      </SectionCard>

      <SectionCard title="Payment Methods" description="Configure which payment methods appear to clients.">
        <Toggle checked={config.payments.showPaymentMethods} onChange={(v) => setPayments({ showPaymentMethods: v })} label="Show payment methods list" />
        <Field label="Accepted Methods">
          <ChipList items={config.payments.acceptedMethods} onChange={(v) => setPayments({ acceptedMethods: v })} />
        </Field>
      </SectionCard>
    </div>
  );
}

export function AboutSection({ config, onChange }: SectionProps) {
  const setAbout = (patch: Partial<typeof config.about>) =>
    onChange({ ...config, about: { ...config.about, ...patch } });

  return (
    <div className="space-y-5">
      <SectionCard title="Content" description="About page heading and body copy.">
        <Field label="Page Title" htmlFor="about-title">
          <TextInput id="about-title" value={config.about.pageTitle} onChange={(v) => setAbout({ pageTitle: v })} />
        </Field>
        <Field label="Heading" htmlFor="about-heading">
          <TextInput id="about-heading" value={config.about.heading} onChange={(v) => setAbout({ heading: v })} />
        </Field>
        <Field label="Body" htmlFor="about-body">
          <TextArea id="about-body" value={config.about.body} onChange={(v) => setAbout({ body: v })} rows={5} />
        </Field>
      </SectionCard>

      <SectionCard title="Extras" description="Optional metadata shown on the About page.">
        <Toggle checked={config.about.showFoundedYear} onChange={(v) => setAbout({ showFoundedYear: v })} label="Show founded year" />
        {config.about.showFoundedYear && (
          <Field label="Founded Year" htmlFor="about-year">
            <TextInput id="about-year" value={config.about.foundedYear} onChange={(v) => setAbout({ foundedYear: v })} placeholder="2018" />
          </Field>
        )}
      </SectionCard>
    </div>
  );
}

export function ContactSection({ config, onChange }: SectionProps) {
  const setContact = (patch: Partial<typeof config.contact>) =>
    onChange({ ...config, contact: { ...config.contact, ...patch } });

  return (
    <div className="space-y-5">
      <SectionCard title="Content" description="Contact page heading and support details.">
        <Field label="Page Title" htmlFor="contact-title">
          <TextInput id="contact-title" value={config.contact.pageTitle} onChange={(v) => setContact({ pageTitle: v })} />
        </Field>
        <Field label="Heading" htmlFor="contact-heading">
          <TextInput id="contact-heading" value={config.contact.heading} onChange={(v) => setContact({ heading: v })} />
        </Field>
      </SectionCard>

      <SectionCard title="Support Details" description="How clients can reach your team.">
        <Field label="Support Email" htmlFor="contact-email">
          <TextInput id="contact-email" value={config.contact.supportEmail} onChange={(v) => setContact({ supportEmail: v })} placeholder="support@company.com" />
        </Field>
        <Field label="Support Phone" htmlFor="contact-phone">
          <TextInput id="contact-phone" value={config.contact.supportPhone} onChange={(v) => setContact({ supportPhone: v })} placeholder="+91 98765 43210" />
        </Field>
        <Field label="Business Hours" htmlFor="contact-hours">
          <TextInput id="contact-hours" value={config.contact.businessHours} onChange={(v) => setContact({ businessHours: v })} placeholder="Mon – Fri, 9:00 AM – 6:00 PM IST" />
        </Field>
      </SectionCard>

      <SectionCard title="Layout" description="Toggle optional layout elements.">
        <Toggle checked={config.contact.showMapPlaceholder} onChange={(v) => setContact({ showMapPlaceholder: v })} label="Show map placeholder" />
      </SectionCard>
    </div>
  );
}

export function ProductsSection({ config, onChange }: SectionProps) {
  const setProducts = (patch: Partial<typeof config.products>) =>
    onChange({ ...config, products: { ...config.products, ...patch } });

  return (
    <div className="space-y-5">
      <SectionCard title="Content" description="Products & Services page heading and description.">
        <Field label="Page Title" htmlFor="prod-title">
          <TextInput id="prod-title" value={config.products.pageTitle} onChange={(v) => setProducts({ pageTitle: v })} />
        </Field>
        <Field label="Heading" htmlFor="prod-heading">
          <TextInput id="prod-heading" value={config.products.heading} onChange={(v) => setProducts({ heading: v })} />
        </Field>
        <Field label="Description" htmlFor="prod-desc">
          <TextArea id="prod-desc" value={config.products.description} onChange={(v) => setProducts({ description: v })} rows={3} />
        </Field>
      </SectionCard>

      <SectionCard title="Display" description="Toggle pricing and unit visibility for offerings.">
        <Toggle checked={config.products.showPricing} onChange={(v) => setProducts({ showPricing: v })} label="Show pricing" />
        <Toggle checked={config.products.showUnit} onChange={(v) => setProducts({ showUnit: v })} label="Show pricing unit (e.g. / month)" />
      </SectionCard>
    </div>
  );
}

export function NavigationSection({ config, onChange }: SectionProps) {
  const setNav = (patch: Partial<typeof config.navigation>) =>
    onChange({ ...config, navigation: { ...config.navigation, ...patch } });

  return (
    <div className="space-y-5">
      <SectionCard title="Navigation Links" description="Toggle which pages appear in the client hub navigation.">
        <Toggle checked={config.navigation.showDashboard} onChange={(v) => setNav({ showDashboard: v })} label="Dashboard" />
        <Toggle checked={config.navigation.showInvoices} onChange={(v) => setNav({ showInvoices: v })} label="Invoices" />
        <Toggle checked={config.navigation.showQuotes} onChange={(v) => setNav({ showQuotes: v })} label="Quotes" />
        <Toggle checked={config.navigation.showPayments} onChange={(v) => setNav({ showPayments: v })} label="Payments" />
        <Toggle checked={config.navigation.showAbout} onChange={(v) => setNav({ showAbout: v })} label="About" />
        <Toggle checked={config.navigation.showContact} onChange={(v) => setNav({ showContact: v })} label="Contact" />
        <Toggle checked={config.navigation.showProducts} onChange={(v) => setNav({ showProducts: v })} label="Products / Services" />
      </SectionCard>

      <SectionCard title="Footer" description="Footer text shown at the bottom of every client hub page.">
        <Field label="Footer Text" htmlFor="footer-text">
          <TextInput id="footer-text" value={config.navigation.footerText} onChange={(v) => setNav({ footerText: v })} />
        </Field>
      </SectionCard>
    </div>
  );
}
