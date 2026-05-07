"use client";

import { useState, useEffect } from "react";
import {
  getBillingDashboardData,
  initiatePlanCheckoutAction,
  cancelSubscriptionAction,
} from "./actions";
import { PLANS, formatPriceInr, type PlanId } from "@/lib/plans/config";

/* ── Types ───────────────────────────────────────────────────────────────── */

type DashboardData = NonNullable<
  Awaited<ReturnType<typeof getBillingDashboardData>> extends { success: true; data: infer D }
    ? D
    : never
>;

/* ── Feature list for plan cards ─────────────────────────────────────────── */

const FEATURE_LIST: { label: string; key: keyof typeof PLANS[0]["limits"]; type: "number" | "boolean" }[] = [
  { label: "Invoices/month", key: "invoicesPerMonth", type: "number" },
  { label: "Vouchers/month", key: "vouchersPerMonth", type: "number" },
  { label: "Salary Slips/month", key: "salarySlipsPerMonth", type: "number" },
  { label: "Storage", key: "storageBytes", type: "number" },
  { label: "Team Members", key: "teamMembers", type: "number" },
  { label: "Customers/Vendors", key: "customersVendors", type: "number" },
  { label: "Custom Branding", key: "customBranding", type: "boolean" },
  { label: "Approval Workflows", key: "approvalWorkflows", type: "boolean" },
  { label: "API Access", key: "apiAccess", type: "boolean" },
  { label: "Priority Support", key: "prioritySupport", type: "boolean" },
];

function formatLimitValue(value: number | boolean, isBytes?: boolean): string {
  if (typeof value === "boolean") return value ? "✓" : "—";
  if (value === -1 || value === Infinity) return "Unlimited";
  if (isBytes) {
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(0)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(0)} GB`;
  }
  return value.toLocaleString("en-IN");
}

/* ── Status helpers ──────────────────────────────────────────────────────── */

function statusBadge(status: string) {
  switch (status) {
    case "active":
    case "trialing":
      return { bg: "#ECFDF5", color: "#059669", label: "Active" };
    case "past_due":
      return { bg: "#FEF2F2", color: "#DC2626", label: "Payment Failed" };
    case "canceled":
      return { bg: "#F5F5F5", color: "#79747E", label: "Canceled" };
    case "paused":
      return { bg: "#FFFBEB", color: "#B45309", label: "Paused" };
    default:
      return { bg: "#F5F5F5", color: "#79747E", label: status };
  }
}

/* ── Main Page ───────────────────────────────────────────────────────────── */

export default function BillingSettingsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await getBillingDashboardData();
      if (!cancelled) {
        setData(result.success ? result.data : null);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function handleUpgrade(planId: string) {
    setUpgrading(true);
    const result = await initiatePlanCheckoutAction({
      planId,
      billingInterval: interval,
      successUrl: `${window.location.origin}/app/settings/billing?success=true`,
      cancelUrl: `${window.location.origin}/app/settings/billing?canceled=true`,
    });
    if (result.success && result.data.checkoutUrl) {
      window.location.assign(result.data.checkoutUrl);
    }
    setUpgrading(false);
  }

  async function handleCancel() {
    if (!confirm("Are you sure you want to cancel? You will retain access until the end of the current billing period.")) {
      return;
    }
    await cancelSubscriptionAction({ atPeriodEnd: true });
    window.location.reload();
  }

  if (loading) {
    return (
      <div className="min-h-screen px-3 py-4 sm:px-4 lg:px-5" style={{ background: "#f8f9fc" }}>
        <div className="mx-auto max-w-[1440px] space-y-6">
          <div className="h-8 w-48 rounded-lg bg-gray-200 animate-pulse" />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="h-40 rounded-2xl bg-gray-200 animate-pulse" />
            <div className="h-40 rounded-2xl bg-gray-200 animate-pulse" />
            <div className="h-40 rounded-2xl bg-gray-200 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const currentPlanId = data?.subscription?.planId ?? "free";
  const currentPlan = PLANS.find((p) => p.id === currentPlanId) ?? PLANS[0];
  const sub = data?.subscription;
  const badge = statusBadge(sub?.status ?? "none");

  return (
    <div className="min-h-screen px-3 py-4 sm:px-4 lg:px-5" style={{ background: "#f8f9fc" }}>
      <div className="mx-auto max-w-[1440px] space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: "#1C1B1F" }}>
              Billing & Subscription
            </h1>
            <p className="text-xs" style={{ color: "#79747E" }}>
              Manage your plan, payments, and invoices
            </p>
          </div>
        </div>

        {/* Current Plan + Billing Info Row */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Current Plan Card */}
          <div
            className="rounded-2xl border bg-white p-5 lg:col-span-2"
            style={{ borderColor: "#E0E0E0" }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#79747E" }}>
                  Current Plan
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <h2 className="text-xl font-bold" style={{ color: "#1C1B1F" }}>
                    {currentPlan.name}
                  </h2>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                    style={{ background: badge.bg, color: badge.color }}
                  >
                    {badge.label}
                  </span>
                </div>
                <p className="mt-1 text-sm" style={{ color: "#49454F" }}>
                  {currentPlan.monthlyPriceInr === 0
                    ? "Free forever"
                    : `${formatPriceInr(currentPlan.monthlyPriceInr)}/month`}
                </p>
              </div>
              <div className="text-right">
                {sub?.currentPeriodEnd && (
                  <p className="text-xs" style={{ color: "#79747E" }}>
                    Renews {new Date(sub.currentPeriodEnd).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                )}
                {sub?.trialEndsAt && sub.status === "trialing" && (
                  <p className="mt-1 text-xs font-medium" style={{ color: "#B45309" }}>
                    Trial ends {new Date(sub.trialEndsAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                )}
              </div>
            </div>

            {/* Alerts */}
            {sub?.cancelAtPeriodEnd && (
              <div
                className="mt-4 rounded-xl border px-4 py-3 text-sm"
                style={{ background: "#FFFBEB", borderColor: "#FEF3C7", color: "#B45309" }}
              >
                Your subscription will be canceled at the end of the current billing period.
              </div>
            )}
            {data?.dunningStatus && (
              <div
                className="mt-4 rounded-xl border px-4 py-3 text-sm"
                style={{ background: "#FEF2F2", borderColor: "#FECACA", color: "#DC2626" }}
              >
                Payment failed. Retry attempt #{data.dunningStatus.attemptNumber} scheduled.
                {data.dunningStatus.willCancel && " Subscription will be canceled if unresolved."}
              </div>
            )}

            {/* Actions */}
            <div className="mt-4 flex items-center gap-2">
              {sub?.status === "active" && currentPlanId !== "free" && (
                <button
                  onClick={handleCancel}
                  className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-red-50"
                  style={{ borderColor: "#FECACA", color: "#DC2626" }}
                >
                  Cancel Plan
                </button>
              )}
              <a
                href="/app/settings/billing/usage"
                className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:border-[#DC2626]"
                style={{ borderColor: "#E0E0E0", color: "#49454F" }}
              >
                View Usage
              </a>
            </div>
          </div>

          {/* Billing Info Card */}
          <div
            className="rounded-2xl border bg-white p-5"
            style={{ borderColor: "#E0E0E0" }}
          >
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#79747E" }}>
              Billing Details
            </p>
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-[11px]" style={{ color: "#79747E" }}>Billing Email</p>
                <p className="text-sm font-medium" style={{ color: "#1C1B1F" }}>
                  {data?.billingAccount?.billingEmail ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px]" style={{ color: "#79747E" }}>Country</p>
                <p className="text-sm font-medium" style={{ color: "#1C1B1F" }}>
                  {data?.billingAccount?.billingCountry ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px]" style={{ color: "#79747E" }}>Currency</p>
                <p className="text-sm font-medium" style={{ color: "#1C1B1F" }}>
                  {data?.billingAccount?.currency ?? "INR"}
                </p>
              </div>
              <div>
                <p className="text-[11px]" style={{ color: "#79747E" }}>Gateway</p>
                <p className="text-sm font-medium capitalize" style={{ color: "#1C1B1F" }}>
                  {data?.billingAccount?.gateway ?? "—"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Plan Comparison */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>
              Compare Plans
            </h2>
            <div className="flex rounded-lg border p-0.5" style={{ borderColor: "#E0E0E0", background: "#fff" }}>
              <button
                onClick={() => setInterval("monthly")}
                className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  background: interval === "monthly" ? "#1C1B1F" : "transparent",
                  color: interval === "monthly" ? "#fff" : "#79747E",
                }}
              >
                Monthly
              </button>
              <button
                onClick={() => setInterval("yearly")}
                className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  background: interval === "yearly" ? "#1C1B1F" : "transparent",
                  color: interval === "yearly" ? "#fff" : "#79747E",
                }}
              >
                Yearly <span style={{ color: "#16A34A" }}>Save 17%</span>
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan) => {
              const isCurrent = plan.id === currentPlanId;
              const price = interval === "monthly" ? plan.monthlyPriceInr : plan.yearlyPriceInr;
              const intervalLabel = interval === "monthly" ? "/mo" : "/yr";

              return (
                <div
                  key={plan.id}
                  className="relative flex flex-col rounded-2xl border bg-white p-5 transition-all"
                  style={{
                    borderColor: isCurrent ? "#DC2626" : "#E0E0E0",
                  }}
                >
                  {plan.popular && (
                    <span
                      className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase"
                      style={{ background: "#DC2626", color: "#fff" }}
                    >
                      Popular
                    </span>
                  )}
                  {isCurrent && (
                    <span
                      className="absolute -top-2 right-3 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase"
                      style={{ background: "#1C1B1F", color: "#fff" }}
                    >
                      Current
                    </span>
                  )}

                  <h3 className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>
                    {plan.name}
                  </h3>
                  <p className="mt-0.5 text-xs" style={{ color: "#79747E" }}>
                    {plan.description}
                  </p>

                  <div className="mt-3">
                    <span className="text-2xl font-bold" style={{ color: "#1C1B1F" }}>
                      {price === 0 ? "Free" : formatPriceInr(price)}
                    </span>
                    {price > 0 && (
                      <span className="text-sm" style={{ color: "#79747E" }}>{intervalLabel}</span>
                    )}
                  </div>

                  {plan.trialDays && plan.trialDays > 0 && !isCurrent && (
                    <p className="mt-1 text-[11px]" style={{ color: "#16A34A" }}>
                      {plan.trialDays}-day free trial
                    </p>
                  )}

                  {/* Feature list */}
                  <div className="mt-4 flex-1 space-y-2">
                    {FEATURE_LIST.map((feat) => {
                      const value = plan.limits[feat.key];
                      const display = formatLimitValue(value, feat.key === "storageBytes");
                      return (
                        <div key={feat.key} className="flex items-center justify-between text-xs">
                          <span style={{ color: "#79747E" }}>{feat.label}</span>
                          <span
                            className="font-semibold"
                            style={{
                              color: typeof value === "boolean"
                                ? value ? "#059669" : "#79747E"
                                : "#1C1B1F",
                            }}
                          >
                            {display}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* CTA */}
                  <div className="mt-4">
                    {!isCurrent && plan.id !== "free" && (
                      <button
                        onClick={() => handleUpgrade(plan.id)}
                        disabled={upgrading}
                        className="w-full rounded-xl py-2.5 text-sm font-semibold transition-colors"
                        style={{
                          background: "#DC2626",
                          color: "#fff",
                          opacity: upgrading ? 0.6 : 1,
                        }}
                      >
                        {upgrading ? "Processing..." : `Upgrade to ${plan.name}`}
                      </button>
                    )}
                    {isCurrent && (
                      <div
                        className="w-full rounded-xl py-2.5 text-center text-sm font-semibold"
                        style={{ background: "#F5F5F5", color: "#79747E" }}
                      >
                        Current Plan
                      </div>
                    )}
                    {!isCurrent && plan.id === "free" && currentPlanId !== "free" && (
                      <button
                        onClick={() => handleUpgrade(plan.id)}
                        disabled={upgrading}
                        className="w-full rounded-xl border py-2.5 text-sm font-semibold transition-colors hover:border-[#DC2626]"
                        style={{ borderColor: "#E0E0E0", color: "#49454F" }}
                      >
                        Downgrade to Free
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Billing History */}
        {data?.recentInvoices && data.recentInvoices.length > 0 && (
          <div
            className="rounded-2xl border bg-white p-5"
            style={{ borderColor: "#E0E0E0" }}
          >
            <h2 className="mb-4 text-sm font-semibold" style={{ color: "#1C1B1F" }}>
              Billing History
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid #F0F0F0" }}>
                    <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#79747E" }}>
                      Invoice
                    </th>
                    <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#79747E" }}>
                      Period
                    </th>
                    <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#79747E" }}>
                      Amount
                    </th>
                    <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#79747E" }}>
                      Status
                    </th>
                    <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#79747E" }}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "#F5F5F5" }}>
                  {data.recentInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="py-3 text-sm font-medium" style={{ color: "#1C1B1F" }}>
                        #{inv.id.slice(-6).toUpperCase()}
                      </td>
                      <td className="py-3 text-xs" style={{ color: "#79747E" }}>
                        {new Date(inv.periodStart).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} –{" "}
                        {new Date(inv.periodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="py-3 text-sm font-semibold" style={{ color: "#1C1B1F" }}>
                        ₹{(Number(inv.amountPaise) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                          style={{
                            background: inv.status === "PAID" ? "#ECFDF5" : "#FFFBEB",
                            color: inv.status === "PAID" ? "#059669" : "#B45309",
                          }}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <a
                          href={`/api/billing/invoices/${inv.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                          style={{ color: "#DC2626" }}
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          PDF
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
