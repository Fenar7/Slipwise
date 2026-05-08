"use client";

/**
 * Sprint 1.6 — Mobile and tablet navigation primitives.
 *
 * Layout collapse rules:
 * - Desktop (≥1280px xl): full 3-pane — left rail + thread list + reading pane + context panel
 * - Tablet (768–1279px md–lg): left rail hidden behind drawer, thread list + reading pane visible
 * - Mobile (<768px): single-panel stacked flow — rail drawer → thread list → reading pane
 *
 * The MailboxMobileNav provides the bottom tab bar and drawer trigger for narrow viewports.
 * The MailboxRailDrawer wraps the left rail in a slide-over for tablet/mobile.
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Inbox, Menu, Pencil, X, ArrowLeft } from "lucide-react";
import type { MailboxResponsivePanel } from "./types";

// ─── Rail drawer (tablet + mobile) ───────────────────────────────────────────

interface MailboxRailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Slide-over drawer that wraps the left rail on tablet and mobile.
 * Traps focus when open; closes on backdrop click or Escape.
 */
export function MailboxRailDrawer({ isOpen, onClose, children }: MailboxRailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const drawer = drawerRef.current;
    if (!drawer) return;

    const selectors = [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");

    const getFocusable = () =>
      Array.from(drawer.querySelectorAll<HTMLElement>(selectors)).filter(
        (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1
      );

    const focusable = getFocusable();
    (focusable[0] ?? drawer).focus();

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key !== "Tab") return;

      const currentFocusable = getFocusable();
      if (currentFocusable.length === 0) {
        e.preventDefault();
        drawer.focus();
        return;
      }

      const first = currentFocusable[0];
      const last = currentFocusable[currentFocusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || active === drawer) {
          e.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      lastFocusedRef.current?.focus();
    };
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/30 transition-opacity xl:hidden",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Mailbox navigation"
        tabIndex={-1}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white shadow-xl transition-transform duration-200 xl:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        data-testid="mailbox-rail-drawer"
      >
        {/* Drawer header */}
        <div
          className="flex h-12 shrink-0 items-center justify-between border-b px-3"
          style={{ borderColor: "#E2E5EA" }}
        >
          <span className="text-sm font-bold tracking-tight text-[#0F172A]">Mailbox</span>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-[#F1F3F7] hover:text-[#0F172A]"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Rail content fills the rest */}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}

// ─── Mobile top bar ───────────────────────────────────────────────────────────

interface MobileTopBarProps {
  /** Current panel being shown */
  activePanel: MailboxResponsivePanel;
  /** Label for the current view/thread */
  label: string;
  onOpenRail: () => void;
  onBack?: () => void;
  onCompose?: () => void;
}

/**
 * Sticky top bar for mobile — shows back navigation and context label.
 * Visible only on mobile (<768px).
 */
export function MobileTopBar({
  activePanel,
  label,
  onOpenRail,
  onBack,
  onCompose,
}: MobileTopBarProps) {
  const showBack = activePanel === "reading-pane" || activePanel === "context";

  return (
    <div
      className="flex h-12 shrink-0 items-center gap-2 border-b bg-white px-3 md:hidden"
      style={{ borderColor: "#E2E5EA" }}
      data-testid="mobile-top-bar"
    >
      {showBack && onBack ? (
        <button
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F3F7]"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      ) : (
        <button
          onClick={onOpenRail}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F3F7]"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}

      <span className="flex-1 truncate text-sm font-semibold text-[#0F172A]">{label}</span>

      {onCompose && (
        <button
          onClick={onCompose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F3F7]"
          aria-label="Compose new message"
        >
          <Pencil className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ─── Tablet top bar ───────────────────────────────────────────────────────────

interface TabletTopBarProps {
  label: string;
  onOpenRail: () => void;
  onCompose?: () => void;
}

/**
 * Compact top bar for tablet — shows hamburger to open rail drawer.
 * Visible on md–lg (768–1279px), hidden on xl+.
 */
export function TabletTopBar({ label, onOpenRail, onCompose }: TabletTopBarProps) {
  return (
    <div
      className="hidden h-12 shrink-0 items-center gap-2 border-b bg-white px-3 md:flex xl:hidden"
      style={{ borderColor: "#E2E5EA" }}
      data-testid="tablet-top-bar"
    >
      <button
        onClick={onOpenRail}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F3F7]"
        aria-label="Open navigation"
      >
        <Menu className="h-4 w-4" />
      </button>
      <span className="flex-1 truncate text-sm font-semibold text-[#0F172A]">{label}</span>
      {onCompose && (
        <button
          onClick={onCompose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F3F7]"
          aria-label="Compose new message"
        >
          <Pencil className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ─── Mobile bottom tab bar ────────────────────────────────────────────────────

interface MobileTabBarProps {
  activePanel: MailboxResponsivePanel;
  onSelectPanel: (panel: MailboxResponsivePanel) => void;
  unreadCount?: number;
}

/**
 * Bottom tab bar for mobile — switches between thread list and reading pane.
 * Visible only on mobile (<768px).
 */
export function MobileTabBar({ activePanel, onSelectPanel, unreadCount }: MobileTabBarProps) {
  return (
    <nav
      className="flex h-14 shrink-0 items-center justify-around border-t bg-white md:hidden"
      style={{ borderColor: "#E2E5EA" }}
      aria-label="Mailbox navigation tabs"
      data-testid="mobile-tab-bar"
    >
      <button
        onClick={() => onSelectPanel("thread-list")}
        className={cn(
          "relative flex flex-col items-center gap-0.5 px-6 py-1 text-[10px] font-semibold transition-colors",
          activePanel === "thread-list" ? "text-[#DC2626]" : "text-[#64748B]"
        )}
        aria-label="Thread list"
        aria-current={activePanel === "thread-list" ? "page" : undefined}
      >
        <Inbox className="h-5 w-5" />
        <span>Inbox</span>
        {unreadCount != null && unreadCount > 0 && (
          <span
            className="absolute right-3 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
            style={{ background: "#DC2626" }}
            aria-label={`${unreadCount} unread`}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <button
        onClick={() => onSelectPanel("reading-pane")}
        className={cn(
          "flex flex-col items-center gap-0.5 px-6 py-1 text-[10px] font-semibold transition-colors",
          activePanel === "reading-pane" ? "text-[#DC2626]" : "text-[#64748B]"
        )}
        aria-label="Reading pane"
        aria-current={activePanel === "reading-pane" ? "page" : undefined}
      >
        <Inbox className="h-5 w-5 rotate-0" />
        <span>Thread</span>
      </button>
    </nav>
  );
}
