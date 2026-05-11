"use client";

/**
 * MessagingChannelCreate — Sprint 1.4
 *
 * Modal for creating a new channel. Centered overlay, not a route change.
 */

import React from "react";
import { cn } from "@/lib/utils";
import { X, Hash, Search, Plus, Check } from "lucide-react";
import { MOCK_PARTICIPANTS } from "./mock-data";

// ─── Static team members for the picker ──────────────────────────────────────

const PICKER_MEMBERS = MOCK_PARTICIPANTS.slice(0, 4);

// ─── Main export ──────────────────────────────────────────────────────────────

interface MessagingChannelCreateProps {
  onClose: () => void;
}

export function MessagingChannelCreate({ onClose }: MessagingChannelCreateProps) {
  const [channelName, setChannelName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [visibility, setVisibility] = React.useState<"public" | "private">("public");
  const [memberSearch, setMemberSearch] = React.useState("");
  const [addedMemberIds, setAddedMemberIds] = React.useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = React.useState(false);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const hasContent = channelName.trim().length > 0;

  const filteredMembers = PICKER_MEMBERS.filter(
    (m) =>
      m.name.toLowerCase().includes(memberSearch.toLowerCase()) &&
      !addedMemberIds.includes(m.id)
  );

  const addedMembers = PICKER_MEMBERS.filter((m) => addedMemberIds.includes(m.id));

  function addMember(id: string) {
    setAddedMemberIds((prev) => [...prev, id]);
    setMemberSearch("");
  }

  function removeMember(id: string) {
    setAddedMemberIds((prev) => prev.filter((x) => x !== id));
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="channel-create-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Modal card */}
      <div
        className="relative w-full max-w-md rounded-xl bg-white shadow-xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Create channel"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "#E0E0E0" }}>
          <h2 className="text-sm font-bold" style={{ color: "#1C1B1F" }}>
            Create a channel
          </h2>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            aria-label="Close"
            onClick={onClose}
            data-testid="channel-create-cancel"
          >
            <X className="h-4 w-4" style={{ color: "#79747E" }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          {/* Channel name */}
          <div className="space-y-1.5">
            <label
              htmlFor="channel-name"
              className="text-xs font-semibold"
              style={{ color: "#49454F" }}
            >
              Channel name <span className="text-[#DC2626]">*</span>
            </label>
            <div
              className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 transition-colors focus-within:border-[#DC2626]"
              style={{ borderColor: "#E0E0E0" }}
            >
              <Hash className="h-3.5 w-3.5 shrink-0 text-[#79747E]" />
              <input
                id="channel-name"
                type="text"
                placeholder="e.g. finance-ops"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-[#79747E]"
                style={{ color: "#1C1B1F" }}
                autoFocus
                data-testid="channel-name-input"
              />
            </div>
            <p className="text-[10px]" style={{ color: "#79747E" }}>
              Use lowercase letters, numbers, and hyphens only.
            </p>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label
              htmlFor="channel-description"
              className="text-xs font-semibold"
              style={{ color: "#49454F" }}
            >
              Description <span className="text-[#79747E] font-normal">(optional)</span>
            </label>
            <textarea
              id="channel-description"
              rows={2}
              placeholder="What's this channel about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border bg-white px-3 py-2 text-xs outline-none resize-none placeholder:text-[#79747E] transition-colors focus:border-[#DC2626]"
              style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
              data-testid="channel-description-input"
            />
          </div>

          {/* Visibility */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "#49454F" }}>
              Visibility
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                role="radio"
                aria-checked={visibility === "public"}
                onClick={() => setVisibility("public")}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]",
                  visibility === "public"
                    ? "border-[#DC2626] bg-red-50 text-[#DC2626]"
                    : "border-[#E0E0E0] text-[#79747E] hover:bg-gray-50"
                )}
                data-testid="channel-visibility-public"
              >
                {visibility === "public" && <Check className="inline h-3 w-3 mr-1" />}
                Public
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={visibility === "private"}
                onClick={() => setVisibility("private")}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]",
                  visibility === "private"
                    ? "border-[#DC2626] bg-red-50 text-[#DC2626]"
                    : "border-[#E0E0E0] text-[#79747E] hover:bg-gray-50"
                )}
                data-testid="channel-visibility-private"
              >
                {visibility === "private" && <Check className="inline h-3 w-3 mr-1" />}
                Private
              </button>
            </div>
            {visibility === "private" && (
              <p className="text-[10px]" style={{ color: "#79747E" }}>
                Only invited members can see this channel.
              </p>
            )}
          </div>

          {/* Member picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "#49454F" }}>
              Add members
            </label>
            <div className="relative">
              <div
                className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 transition-colors focus-within:border-[#DC2626]"
                style={{ borderColor: "#E0E0E0" }}
              >
                <Search className="h-3 w-3 shrink-0 text-[#79747E]" />
                <input
                  type="text"
                  placeholder="Search team members…"
                  value={memberSearch}
                  onChange={(e) => {
                    setMemberSearch(e.target.value);
                    setDropdownOpen(true);
                  }}
                  onFocus={() => setDropdownOpen(true)}
                  className="flex-1 bg-transparent text-xs outline-none placeholder:text-[#79747E]"
                  style={{ color: "#1C1B1F" }}
                  aria-label="Search team members"
                  data-testid="channel-member-picker-input"
                />
              </div>

              {/* Dropdown */}
              {dropdownOpen && filteredMembers.length > 0 && (
                <div
                  className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border bg-white shadow-lg overflow-hidden"
                  style={{ borderColor: "#E0E0E0" }}
                  data-testid="channel-member-dropdown"
                >
                  {filteredMembers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#DC2626]"
                      onClick={() => {
                        addMember(m.id);
                        setDropdownOpen(false);
                      }}
                      data-testid={`channel-picker-member-${m.id}`}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold" style={{ color: "#49454F" }}>
                        {m.avatarInitials}
                      </div>
                      <span className="flex-1 text-xs font-medium" style={{ color: "#1C1B1F" }}>
                        {m.name}
                      </span>
                      <Plus className="h-3.5 w-3.5 text-[#DC2626]" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Added member chips */}
            {addedMembers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2" data-testid="channel-added-members">
                {addedMembers.map((m) => (
                  <span
                    key={m.id}
                    className="flex items-center gap-1 rounded-full border bg-gray-50 px-2 py-1 text-xs font-medium"
                    style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
                    data-testid={`channel-added-chip-${m.id}`}
                  >
                    {m.name}
                    <button
                      type="button"
                      className="flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
                      aria-label={`Remove ${m.name}`}
                      onClick={() => removeMember(m.id)}
                    >
                      <X className="h-2.5 w-2.5 text-[#79747E]" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 border-t px-5 py-4"
          style={{ borderColor: "#E0E0E0" }}
        >
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-xs font-semibold transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            style={{ color: "#49454F" }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={cn(
              "rounded-lg px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]",
              hasContent
                ? "bg-[#DC2626] text-white hover:bg-red-700"
                : "bg-gray-100 text-[#79747E] cursor-not-allowed"
            )}
            disabled={!hasContent}
            aria-disabled={!hasContent}
            data-testid="channel-create-submit"
          >
            Create channel
          </button>
        </div>
      </div>
    </div>
  );
}
