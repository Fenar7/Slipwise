"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useId, useRef, useState, type SVGProps } from "react";
import { ModuleCard } from "@/components/foundation/module-card";
import { SlipwiseProductMockup } from "@/components/marketing/slipwise-product-mockup";
import { useHomepageAnimations } from "@/components/marketing/use-homepage-animations";
import { AuthBlobBackground } from "@/features/auth/components/auth-blob-background";
import { cn } from "@/lib/utils";
import { productModules } from "@/lib/modules";

type SlipwiseHomeProps = {
  className?: string;
};

type IconProps = SVGProps<SVGSVGElement>;

function EyeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

function SparkIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" />
      <path d="M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z" />
    </svg>
  );
}

function ExportIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3v11" />
      <path d="M8 10l4 4 4-4" />
      <path d="M4 18v2h16v-2" />
    </svg>
  );
}

function ClockIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5v5l3 1.8" />
    </svg>
  );
}

function TeamIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 19c0-3.1 2.7-5 6-5s6 1.9 6 5" />
      <path d="M15 18c.2-2 1.7-3.4 4-3.9 1.3-.3 2-.1 2.9.3" />
    </svg>
  );
}

function VoucherIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M5 6h14a2 2 0 0 1 2 2v2a2.5 2.5 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2.5 2.5 0 0 0 0-4V8a2 2 0 0 1 2-2Z" />
      <path d="M9 10h6" />
      <path d="M9 14h4" />
    </svg>
  );
}

function InvoiceIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M7 3h8l4 4v14H7z" />
      <path d="M15 3v4h4" />
      <path d="M10 12h6" />
      <path d="M10 16h6" />
    </svg>
  );
}

function ChevronIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function SalaryIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="4" y="5" width="16" height="14" rx="2.5" />
      <path d="M8 10h8" />
      <path d="M8 14h5" />
      <circle cx="17" cy="15.5" r="1.5" />
    </svg>
  );
}

function PdfStudioIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <path d="M13 17h8" />
      <path d="M17 13v8" />
    </svg>
  );
}

const featurePillars = [
  {
    icon: EyeIcon,
    title: "Live preview",
    body: "Review the finished document while editing, so structure, balance, and brand details are already settled before export.",
  },
  {
    icon: SparkIcon,
    title: "Brand controls",
    body: "Keep logos, sender details, and visual rules aligned across every document your team prepares.",
  },
  {
    icon: ExportIcon,
    title: "Export-ready output",
    body: "Move straight from the last review to print, PDF, or PNG without rebuilding the file elsewhere.",
  },
];

const solutions = [
  {
    icon: SalaryIcon,
    role: "HR / Admin",
    headline: "Issue salary slips without reworking payroll layouts.",
    body: "Prepare employee details, earnings, deductions, and disbursement fields in one calm workspace that stays readable through export.",
  },
  {
    icon: VoucherIcon,
    role: "Operations",
    headline: "Prepare vouchers with the structure teams already expect.",
    body: "Create payment and receipt vouchers with clear narration, approval context, and polished formatting in one pass.",
  },
  {
    icon: InvoiceIcon,
    role: "Finance / Accounts",
    headline: "Send invoices that stay clear from line items to balance due.",
    body: "Keep client details, totals, tax structure, and branding aligned without losing clarity in the final document.",
  },
];

const workflow = [
  {
    step: "01",
    icon: TeamIcon,
    title: "Set the document up",
    body: "Start with the fields teams actually need, so setup feels structured instead of overbuilt.",
  },
  {
    step: "02",
    icon: EyeIcon,
    title: "Review it live",
    body: "The document updates as you edit, which makes review faster and catches layout issues before they matter.",
  },
  {
    step: "03",
    icon: ExportIcon,
    title: "Export and share",
    body: "When it looks right, export it in the format your team needs and send it on with confidence.",
  },
];

const faqs = [
  {
    q: "What can teams generate with Slipwise?",
    a: "Slipwise supports salary slips, invoices, and vouchers in one browser-based product.",
  },
  {
    q: "Does Slipwise need a database or account system?",
    a: "No. Slipwise stays stateless in this phase and remains simple to deploy on Vercel.",
  },
  {
    q: "Can the output be branded?",
    a: "Yes. Logo upload, company details, and accent color controls are part of the active document session.",
  },
  {
    q: "What export formats are available?",
    a: "Slipwise supports browser print, PDF export, and PNG export alongside the live preview.",
  },
];

const heroLines = [
  "Prepare salary slips,",
  "invoices, and vouchers",
  "in one calmer",
  "document workflow.",
];

function getWorkspaceIcon(slug: string) {
  switch (slug) {
    case "voucher":
      return VoucherIcon;
    case "salary-slip":
      return SalaryIcon;
    case "invoice":
      return InvoiceIcon;
    case "pdf-studio":
      return PdfStudioIcon;
    default:
      return SparkIcon;
  }
}

function SectionHeading({
  eyebrow,
  title,
  description,
  animate = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  animate?: boolean;
}) {
  return (
    <div className="max-w-3xl" data-animate={animate ? "section-heading" : undefined}>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-[var(--muted-foreground)]">
        {eyebrow}
      </p>
      <h2 className="mt-4 max-w-3xl text-[2.55rem] leading-[0.98] text-[var(--foreground)] md:text-[3.35rem]">
        {title}
      </h2>
      <p className="mt-5 max-w-2xl text-[1rem] leading-8 text-[var(--foreground-soft)] md:text-[1.05rem]">
        {description}
      </p>
    </div>
  );
}

const FaqAccordionItem = memo(function FaqAccordionItem({
  answer,
  index,
  isOpen,
  question,
  onToggle,
}: {
  answer: string;
  index: number;
  isOpen: boolean;
  question: string;
  onToggle: (index: number) => void;
}) {
  const answerId = `faq-answer-${index}`;
  const buttonId = `faq-trigger-${index}`;

  return (
    <article
      data-animate="faq-card"
      className={cn(
        "rounded-2xl border border-[var(--border-soft)] bg-white p-5 shadow-[var(--shadow-soft)] transition-colors",
        isOpen && "bg-[var(--surface-soft)]",
      )}
    >
      <button
        id={buttonId}
        type="button"
        onClick={() => onToggle(index)}
        aria-expanded={isOpen}
        aria-controls={answerId}
        className="flex w-full items-center justify-between gap-4 text-left text-[1.05rem] font-medium leading-7 text-[var(--foreground)]"
      >
        <span>{question}</span>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border-soft)] bg-white text-[var(--muted-foreground)] will-change-transform"
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 220ms cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <ChevronIcon className="h-4.5 w-4.5" />
        </span>
      </button>

      <div
        id={answerId}
        aria-labelledby={buttonId}
        className="grid"
        style={{
          gridTemplateRows: isOpen ? "1fr" : "0fr",
          transition: "grid-template-rows 220ms cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <p className="mt-4 max-w-2xl text-[0.98rem] leading-8 text-[var(--foreground-soft)]">
            {answer}
          </p>
        </div>
      </div>
    </article>
  );
});

export function SlipwiseHome({ className }: SlipwiseHomeProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const workspacesRef = useRef<HTMLElement | null>(null);
  const dialogTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [isWorkspaceDialogOpen, setIsWorkspaceDialogOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(2);
  const workspaceDialogTitleId = useId();

  const handleFaqToggle = useCallback((index: number) => {
    setOpenFaqIndex((c) => (c === index ? null : index));
  }, []);

  useHomepageAnimations(rootRef);

  useEffect(() => {
    if (!isWorkspaceDialogOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsWorkspaceDialogOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isWorkspaceDialogOpen]);

  const openWorkspaceDialog = (trigger?: HTMLButtonElement | null) => {
    if (trigger) {
      dialogTriggerRef.current = trigger;
    }
    setIsWorkspaceDialogOpen(true);
  };

  const closeWorkspaceDialog = () => {
    setIsWorkspaceDialogOpen(false);
    window.requestAnimationFrame(() => {
      dialogTriggerRef.current?.focus();
    });
  };

  const scrollToWorkspaces = () => {
    workspacesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main ref={rootRef} className={cn("relative isolate overflow-hidden", className)}>
      {/* Liquid blob background behind hero */}
      <div className="absolute inset-x-0 top-0 h-[80vh] overflow-hidden pointer-events-none">
        <AuthBlobBackground />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[54rem] bg-[radial-gradient(circle_at_top,rgba(220,38,38,0.06),transparent_34%)]" />
      <div data-animate="hero-glow-left" className="pointer-events-none absolute left-[-8rem] top-40 -z-10 h-72 w-72 rounded-full bg-[rgba(220,38,38,0.04)] blur-[110px]" />
      <div data-animate="hero-glow-right" className="pointer-events-none absolute right-[-6rem] top-24 -z-10 h-80 w-80 rounded-full bg-[rgba(34,34,34,0.03)] blur-[120px]" />

      <div className="mx-auto flex w-full max-w-[98rem] flex-col gap-8 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <header className="sticky top-4 z-30 rounded-full border border-[var(--border-soft)] bg-white/95 px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-6">
            <Link href="/" className="flex items-center md:justify-self-start">
              <p className="text-[1.45rem] font-medium tracking-[-0.08em] text-[var(--foreground)] md:text-[1.6rem]">
                Slipwise
              </p>
            </Link>

            <nav className="hidden items-center justify-self-center gap-1 text-sm text-[var(--foreground-soft)] md:flex">
              {[
                ["Features", "#features"],
                ["Solutions", "#solutions"],
                ["Workflow", "#workflow"],
                ["FAQ", "#faq"],
              ].map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  className="rounded-full px-4 py-2 transition-colors hover:bg-white hover:text-[var(--foreground)]"
                >
                  {label}
                </a>
              ))}
            </nav>

            <div className="ml-auto flex flex-wrap items-center justify-end gap-2 sm:gap-3 md:justify-self-end">
              <button
                type="button"
                onClick={scrollToWorkspaces}
                className="rounded-full border border-[var(--border-strong)] bg-white px-3.5 py-2 text-[0.82rem] font-medium text-[var(--foreground-soft)] transition-colors hover:border-[var(--accent)] hover:text-[var(--foreground)] sm:px-4 sm:py-2.5 sm:text-sm"
              >
                View workspaces
              </button>
              <button
                type="button"
                onClick={(event) => openWorkspaceDialog(event.currentTarget)}
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-[0.82rem] font-semibold text-white transition-all duration-200 hover:bg-[var(--accent-strong)] sm:px-5 sm:py-2.5 sm:text-sm"
              >
                Start free
              </button>
            </div>
          </div>
        </header>

        <section data-animate="hero" className="grid gap-10 pt-8 lg:min-h-[calc(100vh-8rem)] lg:grid-cols-[minmax(0,0.84fr)_minmax(36rem,1fr)] lg:items-center lg:pt-10">
          <div className="max-w-3xl self-center">
            <div data-animate="hero-eyebrow" className="inline-flex items-center gap-2 rounded-full border border-[rgba(220,38,38,0.15)] bg-white px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--accent)] shadow-[var(--shadow-soft)]">
              For HR, ops, and finance teams
            </div>

            <h1 className="mt-6 max-w-3xl text-[2.2rem] leading-[1.06] text-[var(--foreground)] md:text-[3rem] xl:text-[3.6rem]">
              {heroLines.map((line) => (
                <span key={line} className="block overflow-hidden pb-1">
                  <span data-animate="hero-line" className="block origin-left will-change-transform">
                    {line}
                  </span>
                </span>
              ))}
            </h1>

            <p data-animate="hero-copy" className="mt-6 max-w-xl text-[1.02rem] leading-8 text-[var(--foreground-soft)] md:text-[1.1rem]">
              Slipwise gives teams one clear place to prepare recurring business documents, review them live, and export polished output without repairing layouts in spreadsheets.
            </p>

            <div className="mt-7 flex flex-wrap gap-4">
              <button
                type="button"
                onClick={(event) => openWorkspaceDialog(event.currentTarget)}
                data-animate="hero-cta"
                className="rounded-full bg-[var(--accent)] px-6 py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-[var(--accent-strong)]"
              >
                Open a workspace
              </button>
              <button
                type="button"
                onClick={scrollToWorkspaces}
                data-animate="hero-cta"
                className="rounded-full border border-[var(--border-strong)] bg-white px-6 py-3.5 text-sm font-semibold text-[var(--foreground-soft)] shadow-[var(--shadow-soft)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-soft)] hover:text-[var(--foreground)]"
              >
                Explore workflows
              </button>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {[
                { icon: EyeIcon, label: "Live preview across all three workflows" },
                { icon: ExportIcon, label: "PDF, PNG, and print built in" },
                { icon: SparkIcon, label: "Brand-ready output without layout cleanup" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                <div
                  key={item.label}
                  data-animate="hero-chip"
                  className="flex items-start gap-3 rounded-xl border border-[var(--border-soft)] bg-white px-4 py-3.5 text-sm leading-7 text-[var(--foreground-soft)] shadow-[var(--shadow-soft)]"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-soft)] text-[var(--accent)]">
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span>{item.label}</span>
                </div>
                );
              })}
            </div>
          </div>

          <SlipwiseProductMockup />
        </section>

        <section
          id="features"
          data-animate="features-section"
          className="mt-8 grid gap-6 rounded-2xl border border-[var(--border-strong)] bg-white p-6 shadow-[var(--shadow-card)] md:p-8 xl:grid-cols-[1.06fr_0.94fr]"
        >
          <div data-animate="feature-story" className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-soft)] p-7 shadow-[var(--shadow-soft)] md:p-8">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.3em] text-[var(--muted-foreground)]">
              Feature story
            </p>
            <div className="mt-5 max-w-2xl">
              <h2 className="text-[2.7rem] leading-[0.96] tracking-[-0.05em] text-[var(--foreground)] md:text-[4.15rem]">
                One product for the document work teams repeat every week.
              </h2>
              <p className="mt-5 max-w-xl text-[1.02rem] leading-8 text-[var(--foreground-soft)]">
                Slipwise keeps recurring document preparation inside one browser-based product, with structured inputs, live preview, and clean export-ready output from the start.
              </p>
            </div>

            <div data-animate="feature-extra" className="mt-8 grid gap-4 rounded-xl border border-[var(--border-soft)] bg-white p-5 sm:grid-cols-3">
              {[
                ["Structured input", "Keep recurring document data in one clear flow."],
                ["Live review", "See the layout settle before the file leaves the browser."],
                ["Ready output", "Move from approval to export without rebuilding the document."],
              ].map(([title, body]) => (
                <div key={title} className="rounded-xl border border-[var(--border-soft)] bg-white px-4 py-4 shadow-[var(--shadow-soft)]">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--accent)]">
                    {title}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[var(--foreground-soft)]">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {featurePillars.map((item) => (
              <article
                key={item.title}
                data-animate="feature-card"
                className="rounded-xl border border-[var(--border-soft)] bg-white p-6 shadow-[var(--shadow-soft)]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--surface-soft)] text-[var(--accent)]">
                  <item.icon className="h-5 w-5" />
                </span>
                <p className="mt-4 text-[1.15rem] font-medium text-[var(--foreground)]">
                  {item.title}
                </p>
                <p className="mt-3 text-[0.98rem] leading-8 text-[var(--muted-foreground)]">
                  {item.body}
                </p>
              </article>
            ))}

            <article
              data-animate="feature-card"
              className="rounded-xl border border-[var(--border-soft)] bg-white p-6 shadow-[var(--shadow-soft)]"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--surface-soft)] text-[var(--accent)]">
                <ClockIcon className="h-5 w-5" />
              </span>
              <p className="mt-4 text-[1.15rem] font-medium text-[var(--foreground)]">
                Faster preparation
              </p>
              <p className="mt-3 text-[0.98rem] leading-8 text-[var(--muted-foreground)]">
                Prepare recurring documents with less formatting overhead and more confidence in the final output.
              </p>
            </article>
          </div>
        </section>

        <section
          id="solutions"
          data-animate="solutions-section"
          className="rounded-2xl border border-[var(--border-strong)] bg-white p-6 shadow-[var(--shadow-card)] md:p-8"
        >
          <div data-animate="section-heading">
            <SectionHeading
              eyebrow="Solutions"
              title="Built for the people who actually prepare these documents every week."
              description="Slipwise is designed for payroll, admin, operations, and finance teams that need business documents to stay accurate, presentable, and quick to turn around."
            />
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {solutions.map((item) => (
              <article
                key={item.role}
                data-animate="solution-card"
                className="rounded-xl border border-[var(--border-soft)] bg-white p-6 shadow-[var(--shadow-soft)]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--surface-soft)] text-[var(--accent)]">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <p className="text-[0.68rem] font-medium uppercase tracking-[0.24em] text-[var(--foreground-soft)]">
                    {item.role}
                  </p>
                </div>
                <h3 className="mt-5 text-[1.5rem] font-medium leading-[1.08] tracking-[-0.03em] text-[var(--foreground)]">
                  {item.headline}
                </h3>
                <p className="mt-4 text-[0.98rem] leading-8 text-[var(--foreground-soft)]">
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section
          id="workflow"
          data-animate="workflow-section"
          className="rounded-2xl border border-[var(--border-strong)] bg-white p-6 shadow-[var(--shadow-card)] md:p-8"
        >
          <div data-animate="section-heading" className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] p-6 shadow-[var(--shadow-soft)] md:p-7">
            <SectionHeading
              eyebrow="Workflow"
              title="Three steps from setup to clean export."
              description="The workflow stays simple from start to finish: set the document up, review it live, and export it without switching tools."
            />
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {workflow.map((item) => (
              <article
                key={item.step}
                data-animate="workflow-card"
                className="rounded-xl border border-[var(--border-soft)] bg-white p-6 shadow-[var(--shadow-soft)]"
              >
                <div className="flex items-center justify-between gap-4">
                  <span data-animate="workflow-step" className="text-[0.78rem] font-medium uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
                    {item.step}
                  </span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(220,38,38,0.08)] text-[var(--accent)]">
                    <item.icon className="h-4.5 w-4.5" />
                  </span>
                </div>
                <h3 className="mt-5 text-[1.48rem] font-medium leading-[1.08] tracking-[-0.03em] text-[var(--foreground)]">
                  {item.title}
                </h3>
                <p className="mt-4 text-[0.98rem] leading-8 text-[var(--foreground-soft)]">
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section
          id="workspaces"
          ref={workspacesRef}
          data-animate="generators-section"
          className="rounded-2xl border border-[var(--border-strong)] bg-white p-6 shadow-[var(--shadow-card)] md:p-8"
        >
          <div data-animate="section-heading" className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] p-6 shadow-[var(--shadow-soft)] md:p-7">
            <SectionHeading
              eyebrow="Workspaces"
              title="Four focused workspaces, one consistent product."
              description="Choose the workflow you need and get the same structured editing, live preview, and polished output experience every time."
            />
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {productModules.map((module) => (
              <ModuleCard key={module.slug} module={module} />
            ))}
          </div>
        </section>

        <section
          id="faq"
          data-animate="faq-section"
          className="grid gap-6 rounded-2xl border border-[var(--border-strong)] bg-white p-6 shadow-[var(--shadow-card)] md:p-8 lg:grid-cols-[0.84fr_1.16fr]"
        >
          <div data-animate="section-heading" className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] p-6 shadow-[var(--shadow-soft)] md:p-7">
            <SectionHeading
              eyebrow="FAQ"
              title="The essentials, answered clearly."
              description="Everything important about the product should be easy to understand before someone commits to using it."
            />
          </div>

          <div className="grid gap-4">
            {faqs.map((item, index) => (
              <FaqAccordionItem
                key={item.q}
                index={index}
                question={item.q}
                answer={item.a}
                isOpen={openFaqIndex === index}
                onToggle={handleFaqToggle}
              />
            ))}
          </div>
        </section>

        <section data-animate="final-cta" className="rounded-2xl border border-[var(--border-strong)] bg-white px-6 py-10 shadow-[var(--shadow-card)] md:px-10 md:py-12">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div data-animate="section-heading">
              <p className="text-[0.72rem] font-medium uppercase tracking-[0.28em] text-[var(--muted-foreground)]">
                Ready to begin
              </p>
              <h2 className="mt-4 max-w-3xl text-[2.35rem] leading-[0.98] tracking-[-0.04em] text-[var(--foreground)] md:text-[3.15rem]">
                A calmer way to prepare the documents your team sends every day.
              </h2>
              <p className="mt-5 max-w-2xl text-[1rem] leading-8 text-[var(--foreground-soft)]">
                Slipwise keeps the process clear from start to finish: set the document up, review it live, and export professional output when it is ready.
              </p>
            </div>

            <div className="flex flex-wrap gap-4 lg:justify-end">
              <button
                type="button"
                onClick={(event) => openWorkspaceDialog(event.currentTarget)}
                data-animate="final-cta-action"
                className="rounded-full bg-[var(--accent)] px-7 py-4 text-sm font-semibold text-white transition-all duration-200 hover:bg-[var(--accent-strong)]"
              >
                Start free
              </button>
              <button
                type="button"
                onClick={scrollToWorkspaces}
                data-animate="final-cta-action"
                className="rounded-full border border-[var(--border-strong)] px-7 py-4 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-soft)]"
              >
                View workspaces
              </button>
            </div>
          </div>
        </section>

        <footer className="mt-2 flex flex-col gap-6 border-t border-[var(--border-soft)] py-7 text-sm text-[var(--muted-foreground)] lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-lg font-medium text-[var(--foreground)]">Slipwise</p>
            <p className="mt-2 max-w-xl leading-7">
              Browser-based document workflows for salary slips, invoices, and vouchers, designed to feel clear in the app and polished in export.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {[
              ["Features", "#features"],
              ["Solutions", "#solutions"],
              ["Workflow", "#workflow"],
              ["FAQ", "#faq"],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                className="rounded-full px-3 py-2 hover:bg-[var(--surface-soft)] hover:text-[var(--foreground)]"
              >
                {label}
              </a>
            ))}
          </div>
        </footer>
      </div>

      {isWorkspaceDialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 px-4 pb-4 pt-24 transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] md:items-center md:px-6"
          onClick={closeWorkspaceDialog}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={workspaceDialogTitleId}
            className="w-full max-w-5xl transform-gpu rounded-2xl border border-[var(--border-strong)] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.10)] transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform md:p-8"
            onClick={(event) => event.stopPropagation()}
          >
          <div className="flex items-start justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.34em] text-[var(--muted-foreground)]">
                Choose a workspace
              </p>
              <h2
                id={workspaceDialogTitleId}
                className="mt-3 text-3xl leading-[0.96] text-[var(--foreground)] md:text-[3.35rem]"
              >
                Start in the flow your team actually needs.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-8 text-[var(--foreground-soft)] md:text-[1.02rem]">
                Pick the document workspace that fits the task in front of you. Each one keeps the same Slipwise editing flow, live preview, and export-ready output.
              </p>
            </div>

            <button
              type="button"
              onClick={closeWorkspaceDialog}
              className="slipwise-btn slipwise-btn-secondary h-11 w-11 shrink-0 p-0 text-[var(--foreground-soft)] hover:text-[var(--foreground)]"
              aria-label="Close workspace picker"
            >
              <span aria-hidden="true" className="text-xl leading-none">
                ×
              </span>
            </button>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {productModules.map((module) => {
              const Icon = getWorkspaceIcon(module.slug);

              return (
                <Link
                  key={module.slug}
                  href={module.href}
                  onClick={closeWorkspaceDialog}
                  className="group slipwise-surface-card rounded-2xl p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.32em] text-[var(--muted-foreground)]">
                      {module.eyebrow}
                    </p>
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] text-[var(--accent)] transition-colors group-hover:bg-white">
                      <Icon className="h-5 w-5" />
                    </span>
                  </div>
                  <h3 className="mt-4 text-[1.4rem] leading-[1.08] tracking-[-0.04em] text-[var(--foreground)]">
                    {module.name}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--foreground-soft)]">
                    {module.description}
                  </p>
                  <div className="slipwise-link-inline mt-5 inline-flex items-center gap-2 text-sm font-semibold">
                    Open workspace
                    <span
                      aria-hidden="true"
                      className="transition-transform duration-200 group-hover:translate-x-1"
                    >
                      →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
