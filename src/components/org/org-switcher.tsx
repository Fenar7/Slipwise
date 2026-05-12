"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Plus, Building2, Check, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { panelAppear, fadeInUp } from "@/components/foundation/motion-primitives";

interface OrgItem {
  orgId: string;
  name: string;
  slug: string;
  role: string;
}

interface OrgSwitcherProps {
  initialOrgName?: string;
  fullWidth?: boolean;
}

export function OrgSwitcher({ initialOrgName, fullWidth }: OrgSwitcherProps) {
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/org/list");
      if (!res.ok) return;
      const data = await res.json();
      setOrgs(data.orgs ?? []);
      setActiveOrgId(data.activeOrgId);
    } catch {
      // Silently fail — org list is non-critical for rendering
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handleSwitch(orgId: string) {
    if (orgId === activeOrgId) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      const res = await fetch("/api/org/switch", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeOrgId: orgId }),
      });
      if (res.ok) {
        setActiveOrgId(orgId);
        setOpen(false);
        window.location.reload();
      }
    } catch {
      // Switch failed
    } finally {
      setSwitching(false);
    }
  }

  const activeOrg = orgs.find((o) => o.orgId === activeOrgId);

  if (orgs.length === 0) {
    if (!initialOrgName) return null;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-subtle)] px-3 py-1.5 text-sm">
        <Building2 className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        <span className="font-medium text-[var(--text-primary)] max-w-[140px] truncate">
          {initialOrgName}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("relative", fullWidth && "w-full")} ref={ref}>
      <motion.button
        onClick={() => setOpen(!open)}
        disabled={switching}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors",
          fullWidth && "w-full",
          open
            ? "border-[var(--brand-primary)] bg-[var(--surface-selected)]"
            : "border-[var(--border-soft)] bg-white hover:bg-[var(--surface-subtle)]"
        )}
      >
        <Building2 className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        <span className="font-medium text-[var(--text-primary)] max-w-[140px] truncate">
          {activeOrg?.name ?? initialOrgName ?? "Select Organization"}
        </span>
        {activeOrg && (
          <Badge variant="default" className="ml-1 shrink-0">
            {activeOrg.role}
          </Badge>
        )}
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
        >
          <ChevronDown className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            variants={panelAppear}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              "absolute right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-lg",
              fullWidth ? "left-0 w-full min-w-[220px]" : "w-72"
            )}
          >
            {/* Header */}
            <div className="border-b border-[var(--border-soft)] px-3 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Organizations
              </p>
            </div>

            {/* Org list */}
            <motion.div
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              className="max-h-72 overflow-y-auto p-1.5"
            >
              {orgs.map((org) => (
                <motion.button
                  key={org.orgId}
                  onClick={() => handleSwitch(org.orgId)}
                  disabled={switching}
                  whileTap={{ scale: 0.99 }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    org.orgId === activeOrgId
                      ? "bg-[var(--surface-selected)] font-medium"
                      : "hover:bg-[var(--surface-subtle)]"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white",
                        org.orgId === activeOrgId ? "bg-[var(--brand-primary)]" : "bg-[var(--border-default)]"
                      )}
                    >
                      {org.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[var(--text-primary)]">{org.name}</p>
                      <p className="text-[0.7rem] text-[var(--text-muted)]">{org.slug}</p>
                    </div>
                  </div>
                  {org.orgId === activeOrgId && (
                    <Check className="h-4 w-4 shrink-0 text-[var(--brand-primary)]" />
                  )}
                  {org.orgId !== activeOrgId && (
                    <Badge variant="default" className="shrink-0 ml-2">
                      {org.role}
                    </Badge>
                  )}
                </motion.button>
              ))}
            </motion.div>

            {/* Footer actions */}
            <div className="border-t border-[var(--border-soft)] p-1.5 space-y-0.5">
              <a
                href="/app/settings/organization"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] transition-colors"
              >
                <Settings className="h-4 w-4" />
                Organization Settings
              </a>
              <a
                href="/onboarding"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] transition-colors"
              >
                <Plus className="h-4 w-4" />
                Create New Organization
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
