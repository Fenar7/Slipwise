"use client";

import React, { useState } from "react";
import { MessagingLeftRail } from "./messaging-left-rail";
import { MessagingCommandBar } from "./messaging-command-bar";
import { MessagingWorkspacePane } from "./messaging-workspace-pane";
import type { MessagingSection, MessagingWorkspaceState } from "./types";
import { cn } from "@/lib/utils";

const MOBILE_SECTIONS: Array<{
  section: MessagingSection;
  label: string;
  adminOnly?: boolean;
}> = [
  { section: "channels", label: "Channels" },
  { section: "dms", label: "DMs" },
  { section: "groups", label: "Groups" },
  { section: "tasks", label: "Tasks" },
  { section: "meetings", label: "Meetings" },
  { section: "files", label: "Files" },
  { section: "admin", label: "Admin", adminOnly: true },
];

/**
 * MessagingWorkspace — the top-level shell for the Messaging module.
 *
 * Sprint 1.1 scope: workspace shell and navigation only.
 * - Left rail with all section entry points
 * - Top command/search bar
 * - Section workspace pane (static content per section)
 * - Responsive direction: desktop rail + compact mobile/tablet section switcher
 *
 * No realtime, no persistence, no message sending in this sprint.
 */
export function MessagingWorkspace() {
  const [state, setState] = useState<MessagingWorkspaceState>({
    activeSection: "channels",
    searchQuery: "",
    commandBarOpen: false,
  });

  const setActiveSection = (section: MessagingSection) => {
    setState((prev) => ({ ...prev, activeSection: section }));
  };

  const setSearchQuery = (q: string) => {
    setState((prev) => ({ ...prev, searchQuery: q }));
  };

  const toggleCommandBar = () => {
    setState((prev) => ({ ...prev, commandBarOpen: !prev.commandBarOpen }));
  };

  return (
    <div
      className="flex h-full w-full overflow-hidden"
      style={{ background: "#f8f9fc" }}
      data-testid="messaging-workspace"
    >
      {/*
       * Left rail — hidden on mobile (< lg), visible on desktop.
       * Sprint 1.2+ will add a mobile drawer/bottom nav.
       */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <MessagingLeftRail
          activeSection={state.activeSection}
          onSectionChange={setActiveSection}
        />
      </div>

      {/* Main workspace column */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden bg-white">
        {/* Top command/search bar */}
        <MessagingCommandBar
          searchQuery={state.searchQuery}
          onSearchChange={setSearchQuery}
          commandBarOpen={state.commandBarOpen}
          onCommandBarToggle={toggleCommandBar}
        />

        {/* Mobile / tablet section switcher */}
        <div
          className="flex shrink-0 gap-2 overflow-x-auto border-b bg-[#f8f9fc] px-4 py-3 lg:hidden"
          style={{ borderColor: "#E0E0E0" }}
          data-testid="messaging-mobile-nav"
        >
          {MOBILE_SECTIONS.map(({ section, label, adminOnly }) => {
            const isActive = state.activeSection === section;
            return (
              <button
                key={section}
                type="button"
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  adminOnly
                    ? isActive
                      ? "border-amber-300 bg-amber-50 text-amber-800 focus-visible:ring-amber-400"
                      : "border-[#E0E0E0] bg-white text-amber-700 hover:border-amber-300 hover:bg-amber-50 focus-visible:ring-amber-400"
                    : isActive
                      ? "border-[#DC2626] bg-red-50 text-[#DC2626] focus-visible:ring-[#DC2626]"
                      : "border-[#E0E0E0] bg-white text-[#49454F] hover:border-gray-300 hover:bg-gray-50 focus-visible:ring-[#DC2626]"
                )}
                aria-pressed={isActive}
                aria-label={adminOnly ? `${label} section, admin only` : `${label} section`}
                data-testid={`messaging-mobile-section-${section}`}
                onClick={() => setActiveSection(section)}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Section workspace pane */}
        <div className="flex-1 overflow-hidden">
          <MessagingWorkspacePane activeSection={state.activeSection} />
        </div>
      </div>
    </div>
  );
}
