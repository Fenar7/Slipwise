"use client";

import { Search, Command, Bell, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessagingCommandBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  commandBarOpen: boolean;
  onCommandBarToggle: () => void;
}

export function MessagingCommandBar({
  searchQuery,
  onSearchChange,
  commandBarOpen,
  onCommandBarToggle,
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
        className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-gray-100"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="h-4 w-4" style={{ color: "#79747E" }} />
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
