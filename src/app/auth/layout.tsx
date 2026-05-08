"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AuthLogo } from "@/features/auth/components/auth-logo";
import { AuthBlobBackground } from "@/features/auth/components/auth-blob-background";

const slides = [
  {
    title: "Smart Invoicing",
    description: "Create, send, and track professional invoices in seconds.",
    steps: [
      { label: "Create Invoice", sub: "Draft" },
      { label: "Send to Client", sub: "Deliver" },
      { label: "Track Payment", sub: "Monitor" },
    ],
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" x2="8" y1="13" y2="13" />
        <line x1="16" x2="8" y1="17" y2="17" />
        <line x1="10" x2="8" y1="9" y2="9" />
      </svg>
    ),
  },
  {
    title: "Digital Vouchers",
    description: "Generate and manage vouchers with automated reconciliation.",
    steps: [
      { label: "Create Voucher", sub: "Draft" },
      { label: "Approve", sub: "Review" },
      { label: "Redeem", sub: "Settle" },
    ],
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="14" x="2" y="5" rx="2" />
        <line x1="2" x2="22" y1="10" y2="10" />
      </svg>
    ),
  },
  {
    title: "Salary Slips",
    description: "Automated payroll documents with compliance-ready formats.",
    steps: [
      { label: "Calculate Payroll", sub: "Compute" },
      { label: "Generate Slip", sub: "Create" },
      { label: "Disburse Salary", sub: "Pay" },
    ],
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="12" x="2" y="6" rx="2" />
        <circle cx="12" cy="12" r="2" />
        <path d="M6 12h.01M18 12h.01" />
      </svg>
    ),
  },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isSignup = pathname === "/auth/signup";
  const blobVariant = isSignup ? "purple" : "red";
  const [active, setActive] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActive((prev) => (prev + 1) % slides.length);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left branded panel */}
      <div className="relative hidden lg:flex lg:w-1/2 xl:w-[45%] flex-col justify-between overflow-hidden"
        style={{ background: "linear-gradient(180deg, #f8f9fc 0%, #f1f3f7 100%)" }}
      >
        {/* Subtle dot grid */}
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--border-strong) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* Top logo */}
        <div className="relative z-10 px-10 pt-10">
          <AuthLogo />
        </div>

        {/* Center product workflow slides */}
        <div className="relative z-10 flex-1 flex items-center justify-center px-10">
          <div className="w-full max-w-md">
            <div className="relative h-[280px]">
              {slides.map((slide, idx) => (
                <div
                  key={slide.title}
                  className="absolute inset-0 transition-all duration-700 ease-in-out"
                  style={{
                    opacity: active === idx ? 1 : 0,
                    transform: active === idx ? "translateX(0)" : "translateX(16px)",
                    pointerEvents: active === idx ? "auto" : "none",
                  }}
                >
                  <WorkflowSlide slide={slide} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom tagline — changes per slide + dots */}
        <div className="relative z-10 px-10 pb-10 text-center">
          <h2 className="text-lg font-semibold tracking-tight transition-opacity duration-500" style={{ color: "var(--text-primary)" }}>
            {slides[active].title}
          </h2>
          <p className="text-sm mt-1 transition-opacity duration-500" style={{ color: "var(--text-muted)" }}>
            {slides[active].description}
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-4">
            {slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActive(idx)}
                className="h-1.5 w-1.5 rounded-full transition-all duration-300"
                style={{
                  backgroundColor: active === idx ? "var(--text-muted)" : "var(--border-strong)",
                  transform: active === idx ? "scale(1.3)" : "scale(1)",
                }}
                aria-label={`Go to ${slides[idx].title}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Mobile header */}
      <div className="lg:hidden flex items-center justify-center py-5 bg-white border-b" style={{ borderColor: "#E0E0E0" }}>
        <AuthLogo />
      </div>

      {/* Right form panel */}
      <div className="relative flex-1 flex flex-col items-center bg-white overflow-y-auto">
        {/* Liquid blob background behind form */}
        <AuthBlobBackground variant={blobVariant} />

        <div className="relative z-10 w-full max-w-[520px] px-6 py-10 sm:px-10 my-auto">
          {/* Desktop logo inside form area */}
          <div className="hidden lg:flex justify-center mb-8">
            <AuthLogo />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function WorkflowSlide({ slide }: { slide: typeof slides[0] }) {
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center">
      {/* SVG connectors */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 400 280"
        fill="none"
        preserveAspectRatio="xMidYMid meet"
      >
        <path
          d="M110 70 C 160 70, 160 130, 200 130"
          stroke="var(--border-default)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          fill="none"
        />
        <path
          d="M200 170 C 200 210, 120 210, 90 240"
          stroke="var(--border-default)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          fill="none"
        />
        <path
          d="M200 170 C 200 210, 280 210, 310 240"
          stroke="var(--border-default)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          fill="none"
        />
      </svg>

      {/* Card 1 */}
      <div className="flex justify-start w-full mb-6">
        <div className="bg-white/80 backdrop-blur-sm border border-[var(--border-soft)] rounded-xl p-4 w-48">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[var(--surface-subtle)] flex items-center justify-center border border-[var(--border-soft)]" style={{ color: "var(--text-muted)" }}>
              {slide.icon}
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{slide.steps[0].label}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{slide.steps[0].sub}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Card 2 */}
      <div className="flex justify-center w-full mb-6">
        <div className="bg-white/80 backdrop-blur-sm border border-[var(--border-soft)] rounded-xl p-4 w-52">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[var(--surface-subtle)] flex items-center justify-center border border-[var(--border-soft)]" style={{ color: "var(--text-muted)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{slide.steps[1].label}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{slide.steps[1].sub}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Card 3 & Title row */}
      <div className="flex justify-between w-full gap-4">
        <div className="bg-white/80 backdrop-blur-sm border border-[var(--border-soft)] rounded-xl p-4 w-44">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[var(--state-success-soft)] flex items-center justify-center border border-[var(--state-success-soft)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--state-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{slide.steps[2].label}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{slide.steps[2].sub}</p>
            </div>
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-sm border border-[var(--border-soft)] rounded-xl p-4 w-36 flex items-center justify-center">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{slide.title}</p>
        </div>
      </div>
    </div>
  );
}
