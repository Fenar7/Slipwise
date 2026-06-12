"use client";

import React, { useState, useEffect } from "react";
import { MessagingLeftRail } from "./messaging-left-rail";
import { MessagingCommandBar } from "./messaging-command-bar";
import { MessagingWorkspacePane } from "./messaging-workspace-pane";
import {
  ChannelConversationList,
  DMConversationList,
  GroupConversationList,
} from "./messaging-conversation-list";
import { MessagingReadingWorkspace } from "./messaging-reading-workspace";
import { MessagingSearchPanel } from "./messaging-search-panel";
import { MessagingNotificationsPanel } from "./messaging-notifications-panel";
import type {
  MessagingSection,
  MessagingWorkspaceState,
  ActiveConversation,
  MessagingNotification,
} from "./types";
import { MOCK_NOTIFICATIONS } from "./mock-data";
import { useWorkspaceTopBar } from "@/components/layout/workspace-topbar-context";
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
 * MessagingWorkspace — top-level shell for the Messaging module.
 *
 * Sprint 1.1: workspace shell and navigation.
 * Sprint 1.2: conversation list column + reading workspace for channels/DMs/groups.
 *
 * Sections that have a conversation model (channels, dms, groups) now render a
 * two-column layout: conversation list on the left, reading workspace on the right.
 * All other sections (tasks, meetings, files, admin) continue to use the Sprint 1.1
 * workspace pane unchanged.
 */
export function MessagingWorkspace() {
  const [state, setState] = useState<MessagingWorkspaceState>({
    activeSection: "channels",
    searchQuery: "",
    commandBarOpen: false,
  });

  // Sprint 1.2: active conversation per section, kept separate so switching
  // sections preserves the last-selected conversation in each.
  const [activeConversations, setActiveConversations] = useState<
    Partial<Record<MessagingSection, ActiveConversation>>
  >({});

  const setActiveSection = (section: MessagingSection) => {
    setState((prev) => ({ ...prev, activeSection: section }));
  };

  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifications, setNotifications] = useState<MessagingNotification[]>(MOCK_NOTIFICATIONS);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Register contextual tabs and action buttons in the global top bar
  const { registerTabs, registerActions, clear } = useWorkspaceTopBar();
  useEffect(() => {
    registerTabs(
      MOBILE_SECTIONS.map(({ section, label }) => ({
        id: section,
        label,
        active: state.activeSection === section,
        onClick: () => setActiveSection(section),
      }))
    );
    registerActions([
      {
        id: "new-message",
        label: "+ New",
        variant: "primary",
        onClick: () => toggleCommandBar(),
      },
      {
        id: "search",
        label: "Search",
        variant: "subtle",
        onClick: () => {
          setSearchOpen(true);
          setNotifOpen(false);
        },
      },
    ]);
    return () => clear();
  }, [state.activeSection, registerTabs, registerActions, clear]);

  function handleSearchChange(q: string) {
    setState((prev) => ({ ...prev, searchQuery: q }));
    setSearchOpen(q.length > 0);
    if (q.length > 0) setNotifOpen(false);
  }

  const toggleCommandBar = () => {
    setState((prev) => ({ ...prev, commandBarOpen: !prev.commandBarOpen }));
  };

  const handleConversationSelect = (conv: ActiveConversation) => {
    setActiveConversations((prev) => ({
      ...prev,
      [state.activeSection]: conv,
    }));
  };

  const activeConversation = activeConversations[state.activeSection] ?? null;

  // Sections that use the Sprint 1.2 two-column conversation layout
  const isConversationSection =
    state.activeSection === "channels" ||
    state.activeSection === "dms" ||
    state.activeSection === "groups";

  return (
    <div
      className="flex h-full w-full overflow-hidden"
      style={{ background: "#f8f9fc" }}
      data-testid="messaging-workspace"
    >
      {/* Left rail — hidden on mobile (< lg) */}
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
          onSearchChange={handleSearchChange}
          commandBarOpen={state.commandBarOpen}
          onCommandBarToggle={toggleCommandBar}
          notifOpen={notifOpen}
          onNotifToggle={() => {
            setNotifOpen((o) => !o);
            setSearchOpen(false);
          }}
          onSearchFocus={() => {
            setSearchOpen(true);
            setNotifOpen(false);
          }}
          unreadCount={unreadCount}
          activeSectionLabel={state.activeSection}
        />

        {searchOpen && (
          <MessagingSearchPanel
            query={state.searchQuery}
            onClose={() => {
              setSearchOpen(false);
              setState((prev) => ({ ...prev, searchQuery: "" }));
            }}
          />
        )}

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

        {/* Section workspace */}
        <div className="flex flex-1 overflow-hidden">
          {isConversationSection ? (
            /*
             * Sprint 1.2 two-column layout:
             * [conversation list ~280px] [reading workspace flex-1]
             */
            <div
              className="flex flex-1 flex-col overflow-hidden md:flex-row"
              data-testid="messaging-workspace-pane"
            >
              {/* Conversation list column */}
              <div
                className="flex min-h-[18rem] shrink-0 flex-col overflow-hidden border-b md:min-h-0 md:w-72 md:border-b-0 md:border-r md:shrink-0"
                style={{ borderColor: "#E0E0E0" }}
                data-testid="conversation-list-column"
              >
                {state.activeSection === "channels" && (
                  <ChannelConversationList
                    activeConversationId={activeConversation?.id ?? null}
                    onSelect={handleConversationSelect}
                  />
                )}
                {state.activeSection === "dms" && (
                  <DMConversationList
                    activeConversationId={activeConversation?.id ?? null}
                    onSelect={handleConversationSelect}
                  />
                )}
                {state.activeSection === "groups" && (
                  <GroupConversationList
                    activeConversationId={activeConversation?.id ?? null}
                    onSelect={handleConversationSelect}
                  />
                )}
              </div>

              {/* Reading workspace */}
              <div className="flex min-h-0 flex-1 overflow-hidden">
                <MessagingReadingWorkspace
                  conversation={activeConversation}
                  sectionKind={
                    state.activeSection === "channels"
                      ? "channel"
                      : state.activeSection === "dms"
                      ? "dm"
                      : "group"
                  }
                  degraded={false}
                />
              </div>
            </div>
          ) : (
            /* Sprint 1.1 pane for tasks / meetings / files / admin */
            <MessagingWorkspacePane activeSection={state.activeSection} />
          )}
        </div>

        {notifOpen && (
          <MessagingNotificationsPanel
            onClose={() => setNotifOpen(false)}
            notifications={notifications}
            onMarkAllRead={() =>
              setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
            }
            onToggleRead={(id) =>
              setNotifications((prev) =>
                prev.map((n) => (n.id === id ? { ...n, read: !n.read } : n))
              )
            }
          />
        )}
      </div>
    </div>
  );
}
