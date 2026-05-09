"use client";

import React, { useState } from "react";
import { MessagingLeftRail } from "./messaging-left-rail";
import { MessagingCommandBar } from "./messaging-command-bar";
import { MessagingWorkspacePane } from "./messaging-workspace-pane";
import type { MessagingSection, MessagingWorkspaceState } from "./types";

/**
 * MessagingWorkspace — the top-level shell for the Messaging module.
 *
 * Sprint 1.1 scope: workspace shell and navigation only.
 * - Left rail with all section entry points
 * - Top command/search bar
 * - Section workspace pane (static content per section)
 * - Responsive direction: left rail hidden on mobile (future sprint extends this)
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

        {/* Section workspace pane */}
        <div className="flex-1 overflow-hidden">
          <MessagingWorkspacePane activeSection={state.activeSection} />
        </div>
      </div>
    </div>
  );
}
