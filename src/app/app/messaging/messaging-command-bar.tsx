"use client";

import { Search, Command, Bell, Settings } from "lucide-react";
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
}

export function MessagingCommandBar({
  searchQuery,
  onSearchChange,
  commandBarOpen,
  onCommandBarToggle,
  notifOpen,
  onNotifToggle,
  onSearchFocus,
  unreadCount,
}: MessagingCommandBarProps) {
  return (
    <header
      className="flex h-12 shrink-0 items-center gap-3 border-b bg-white px-4"
      style={{ borderColor: "#E0E0E0" }}
      data-testid="messaging-command-bar"
    >
      {/* Search / command input */}
      <div
        className={cn(
          "flex flex-1 items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors cursor-text",
          commandBarOpen
            ? "border-[#DC2626] bg-red-50"
            : "border-[#E0E0E0] bg-[#f8f9fc] hover:border-gray-300"
        )}
        onClick={onCommandBarToggle}
        role="button"
        aria-label="Search or run a command"
        data-testid="messaging-search-input"
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-[#79747E]" />
        <input
          type="text"
          placeholder="Search messages, channels, people…"
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

      {/* Notification bell */}
      <button
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
          notifOpen ? "bg-red-50 text-[#DC2626]" : "hover:bg-gray-100"
        )}
        aria-label="Notifications"
        title="Notifications"
        aria-pressed={notifOpen}
        onClick={onNotifToggle}
        data-testid="notif-bell-button"
      >
        <Bell className="h-4 w-4" style={notifOpen ? undefined : { color: "#79747E" }} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#DC2626] ring-2 ring-white" />
        )}
      </button>

      {/* Messaging settings */}
      <button
        className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-gray-100"
        aria-label="Messaging settings"
        title="Messaging settings"
        data-testid="messaging-settings-button"
      >
        <Settings className="h-4 w-4" style={{ color: "#79747E" }} />
      </button>
    </header>
  );
}
