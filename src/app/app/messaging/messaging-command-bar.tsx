"use client";

import React from "react";
import {
  Search,
  Command,
  Bell,
  Settings,
  Plus,
  Hash,
  MessageSquare,
  Users,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MessagingCommandBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  commandBarOpen: boolean;
  onCommandBarToggle: () => void;
  notifOpen: boolean;
  onNotifToggle: () => void;
  onSearchFocus: () => void;
  unreadCount: number;
  activeSectionLabel?: string;
  onCreateMessageClick?: () => void;
  onCreateChannelClick?: () => void;
  onCreateGroupClick?: () => void;
}

const NEW_ACTIONS = [
  { label: "New message", icon: MessageSquare, testId: "cmd-new-message" },
  { label: "New channel", icon: Hash, testId: "cmd-new-channel" },
  { label: "New group", icon: Users, testId: "cmd-new-group" },
];

export function MessagingCommandBar({
  searchQuery,
  onSearchChange,
  commandBarOpen,
  onCommandBarToggle,
  notifOpen,
  onNotifToggle,
  onSearchFocus,
  unreadCount,
  activeSectionLabel = "Messages",
  onCreateMessageClick,
  onCreateChannelClick,
  onCreateGroupClick,
}: MessagingCommandBarProps) {
  const [newOpen, setNewOpen] = React.useState(false);

  return (
    <header
      className="flex h-12 shrink-0 items-center gap-3 border-b bg-white px-4"
      style={{ borderColor: "#E0E0E0" }}
      data-testid="messaging-command-bar"
    >
      {/* Context label */}
      <div className="hidden md:flex shrink-0 items-center">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#79747E" }}>
          {activeSectionLabel}
        </span>
      </div>

      <div className="h-5 w-px hidden md:block" style={{ background: "#E0E0E0" }} />

      {/* New action dropdown — subtle, not screaming red */}
      <div className="relative shrink-0">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-2"
          style={{ borderColor: "#E0E0E0", color: "#49454F" }}
          onClick={() => setNewOpen((o) => !o)}
          data-testid="cmd-new-dropdown"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">New</span>
          <ChevronDown className="h-3 w-3" />
        </button>
        {newOpen && (
          <div
            className="absolute left-0 top-10 z-30 w-48 rounded-lg border bg-white py-1 shadow-lg"
            style={{ borderColor: "#E0E0E0" }}
            data-testid="cmd-new-menu"
          >
            {NEW_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.testId}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:bg-gray-50"
                  style={{ color: "#49454F" }}
                  data-testid={action.testId}
                  onClick={() => {
                    setNewOpen(false);
                    if (action.testId === "cmd-new-message") onCreateMessageClick?.();
                    if (action.testId === "cmd-new-channel") onCreateChannelClick?.();
                    if (action.testId === "cmd-new-group") onCreateGroupClick?.();
                  }}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {action.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Search / command input — cleaner, less boxed */}
      <div
        className={cn(
          "flex flex-1 items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors cursor-text",
          commandBarOpen
            ? "border-[#DC2626] bg-red-50"
            : "border-transparent bg-[#f8f9fc] hover:border-[#E0E0E0]"
        )}
        onClick={onCommandBarToggle}
        role="button"
        aria-label="Search or run a command"
        data-testid="messaging-search-input"
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-[#79747E]" />
        <input
          type="text"
          placeholder="Search…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={onSearchFocus}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#79747E]"
          style={{ color: "#1C1B1F" }}
          aria-label="Search messaging"
          onClick={(e) => e.stopPropagation()}
        />
        {/* Keyboard shortcut hint */}
        <div className="hidden items-center gap-0.5 sm:flex">
          <kbd className="flex h-4 items-center rounded border px-1 text-[10px] font-medium" style={{ borderColor: "#E0E0E0", color: "#79747E" }}>
            <Command className="h-2.5 w-2.5" />
          </kbd>
          <kbd className="flex h-4 items-center rounded border px-1 text-[10px] font-medium" style={{ borderColor: "#E0E0E0", color: "#79747E" }}>
            K
          </kbd>
        </div>
      </div>

      {/* Right controls — uniform h-8 w-8 icon buttons */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          className={cn(
            "relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
            notifOpen ? "bg-gray-100 text-[#1C1B1F]" : "hover:bg-gray-100"
          )}
          aria-label="Notifications"
          title="Notifications"
          aria-pressed={notifOpen}
          onClick={onNotifToggle}
          data-testid="notif-bell-button"
        >
          <Bell className="h-4 w-4" style={{ color: "#79747E" }} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[#DC2626] px-1 text-[9px] font-bold text-white ring-2 ring-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        <button
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-gray-100"
          aria-label="Messaging settings"
          title="Messaging settings"
          data-testid="messaging-settings-button"
        >
          <Settings className="h-4 w-4" style={{ color: "#79747E" }} />
        </button>
      </div>
    </header>
  );
}
