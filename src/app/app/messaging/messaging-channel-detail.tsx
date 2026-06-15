"use client";

/**
 * MessagingChannelDetail — Sprint 1.4
 *
 * Right-side detail panel for a selected channel. Slides in when the user
 * clicks the Info button in the workspace header.
 */

import React from "react";
import { cn } from "@/lib/utils";
import {
  X,
  Hash,
  Lock,
  Users,
  Pin,
  Settings,
  Search,
  MoreHorizontal,
  Edit2,
  Archive,
  Trash2,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import type { ActiveConversation, ChannelPanelTab, ChannelMember, PinnedMessage } from "./types";
import { MOCK_CHANNEL_MEMBERS, MOCK_PINNED_MESSAGES } from "./mock-data";
import { RadioPill } from "./messaging-ui-primitives";

// ─── Shared primitives ────────────────────────────────────────────────────────

function PresenceDot({ status }: { status: ChannelMember["presence"] }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full shrink-0",
        status === "online" && "bg-emerald-500",
        status === "away" && "bg-amber-400",
        status === "offline" && "bg-gray-300"
      )}
      aria-label={status}
      data-testid="member-presence-dot"
    />
  );
}

function RoleBadge({ role }: { role: ChannelMember["role"] }) {
  if (role === "member") {
    return (
      <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-[#79747E]">
        Member
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 capitalize">
      {role}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── ChannelDetailHeader ──────────────────────────────────────────────────────

interface ChannelDetailHeaderProps {
  activeTab: ChannelPanelTab;
  onTabChange: (tab: ChannelPanelTab) => void;
  onClose: () => void;
  channelName: string;
}

function ChannelDetailHeader({
  activeTab,
  onTabChange,
  onClose,
  channelName,
}: ChannelDetailHeaderProps) {
  const tabs: { id: ChannelPanelTab; label: string }[] = [
    { id: "info", label: "Info" },
    { id: "members", label: "Members" },
    { id: "pinned", label: "Pinned" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className="shrink-0 border-b bg-white" style={{ borderColor: "#E0E0E0" }}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Hash className="h-4 w-4 shrink-0 text-[#79747E]" />
          <span className="text-sm font-bold truncate" style={{ color: "#1C1B1F" }}>
            {channelName}
          </span>
        </div>
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          aria-label="Close channel detail"
          onClick={onClose}
          data-testid="channel-detail-close"
        >
          <X className="h-4 w-4" style={{ color: "#79747E" }} />
        </button>
      </div>
      {/* Tab bar */}
      <div className="flex border-t" role="tablist" aria-label="Channel detail tabs" style={{ borderColor: "#F0F0F0" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex-1 py-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#DC2626]",
              activeTab === tab.id
                ? "border-b-2 border-[#DC2626] text-[#DC2626]"
                : "text-[#79747E] hover:text-[#1C1B1F]"
            )}
            aria-selected={activeTab === tab.id}
            role="tab"
            data-testid={`channel-tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── ChannelInfoTab ───────────────────────────────────────────────────────────

interface ChannelInfoTabProps {
  conversation: ActiveConversation;
}

function ChannelInfoTab({ conversation }: ChannelInfoTabProps) {
  const isPrivate = conversation.channelVisibility === "private";
  const memberCount = MOCK_CHANNEL_MEMBERS.length;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5" data-testid="channel-info-tab">
      {/* Name + visibility */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          {isPrivate ? (
            <Lock className="h-4 w-4 text-[#79747E]" />
          ) : (
            <Hash className="h-4 w-4 text-[#79747E]" />
          )}
          <span className="text-base font-bold" style={{ color: "#1C1B1F" }}>
            #{conversation.name}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              isPrivate
                ? "bg-gray-100 text-[#79747E]"
                : "bg-emerald-50 text-emerald-700"
            )}
            data-testid="channel-visibility-badge"
          >
            {isPrivate ? "Private" : "Public"}
          </span>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: "#79747E" }}>
          {conversation.subtitle.split("·")[0].trim()}
        </p>
      </div>

      {/* Divider */}
      <div className="h-px" style={{ background: "#F0F0F0" }} />

      {/* Created date */}
      <div className="flex items-center gap-2">
        <Calendar className="h-3.5 w-3.5 shrink-0 text-[#79747E]" />
        <span className="text-xs" style={{ color: "#79747E" }}>
          Created <span className="font-semibold text-[#49454F]">1 Nov 2025</span>
        </span>
      </div>

      {/* Member count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 shrink-0 text-[#79747E]" />
          <span className="text-xs" style={{ color: "#79747E" }}>
            <span className="font-semibold text-[#49454F]">{memberCount}</span> members
          </span>
        </div>
        <button
          type="button"
          className="text-xs font-semibold text-[#DC2626] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] rounded"
          data-testid="channel-view-all-members"
        >
          View all members
        </button>
      </div>

      {/* Divider */}
      <div className="h-px" style={{ background: "#F0F0F0" }} />

      {/* Leave channel */}
      <button
        type="button"
        className="w-full rounded-lg border px-4 py-2.5 text-xs font-semibold transition-colors hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        style={{ borderColor: "#E0E0E0", color: "#49454F" }}
        data-testid="channel-leave-btn"
      >
        Leave channel
      </button>
    </div>
  );
}

// ─── ChannelMembersTab ────────────────────────────────────────────────────────

function ChannelMembersTab() {
  const [search, setSearch] = React.useState("");

  const filtered = MOCK_CHANNEL_MEMBERS.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col flex-1 overflow-hidden" data-testid="channel-members-tab">
      {/* Search */}
      <div className="px-4 py-3 border-b" style={{ borderColor: "#F0F0F0" }}>
        <div
          className="flex items-center gap-2 rounded-lg border bg-[#f8f9fc] px-2.5 py-1.5"
          style={{ borderColor: "#E8E8E8" }}
        >
          <Search className="h-3 w-3 shrink-0text-[#79747E]" style={{ color: "#79747E" }} />
          <input
            type="text"
            placeholder="Search members…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-[#79747E]"
            style={{ color: "#1C1B1F" }}
            aria-label="Search members"
            data-testid="channel-member-search"
          />
        </div>
      </div>

      {/* Member list */}
      <div className="flex-1 overflow-y-auto py-2">
        {filtered.map((member) => (
          <div
            key={member.id}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
            data-testid={`channel-member-row-${member.id}`}
          >
            {/* Avatar */}
            <div className="relative shrink-0">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-bold"
                style={{ color: "#49454F" }}
              >
                {member.avatarInitials}
              </div>
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white",
                  member.presence === "online" && "bg-emerald-500",
                  member.presence === "away" && "bg-amber-400",
                  member.presence === "offline" && "bg-gray-300"
                )}
                aria-hidden="true"
              />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold truncate" style={{ color: "#1C1B1F" }}>
                  {member.name}
                </span>
                <RoleBadge role={member.role} />
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <PresenceDot status={member.presence} />
                <span className="text-[10px]" style={{ color: "#79747E" }}>
                  Joined {formatDate(member.joinedAt)}
                </span>
              </div>
            </div>

            {/* Three-dot action */}
            <button
              type="button"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
              aria-label="Member options"
              data-testid={`member-options-${member.id}`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" style={{ color: "#79747E" }} />
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs" style={{ color: "#79747E" }}>No members match your search.</p>
          </div>
        )}
      </div>

      {/* Invite button */}
      <div className="shrink-0 border-t px-4 py-3" style={{ borderColor: "#E0E0E0" }}>
        <button
          type="button"
          className="w-full rounded-lg border px-4 py-2 text-xs font-semibold transition-colors hover:bg-red-50 hover:border-[#DC2626] hover:text-[#DC2626] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          style={{ borderColor: "#E0E0E0", color: "#49454F" }}
          data-testid="channel-invite-member-btn"
        >
          + Invite member
        </button>
      </div>
    </div>
  );
}

// ─── ChannelPinnedTab ─────────────────────────────────────────────────────────

function ChannelPinnedTab() {
  if (MOCK_PINNED_MESSAGES.length === 0) {
    return (
      <div
        className="flex flex-1 items-center justify-center px-4 text-center"
        data-testid="channel-pinned-tab"
      >
        <p className="text-xs" style={{ color: "#79747E" }}>
          No pinned messages in this channel.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" data-testid="channel-pinned-tab">
      {MOCK_PINNED_MESSAGES.map((pin: PinnedMessage) => (
        <div
          key={pin.id}
          className="rounded-xl border p-3 space-y-2"
          style={{ borderColor: "#F0F0F0" }}
          data-testid={`pinned-message-${pin.id}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Pin className="h-3 w-3 shrink-0 text-[#DC2626]" />
              <span className="text-xs font-semibold" style={{ color: "#1C1B1F" }}>
                {pin.authorName}
              </span>
            </div>
            <span className="text-[10px] shrink-0" style={{ color: "#79747E" }}>
              {formatDate(pin.pinnedAt)}
            </span>
          </div>
          <p className="text-xs leading-relaxed line-clamp-3" style={{ color: "#49454F" }}>
            {pin.body}
          </p>
          <button
            type="button"
            className="text-xs font-semibold text-[#79747E] hover:text-[#DC2626] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] rounded"
            data-testid={`unpin-btn-${pin.id}`}
          >
            Unpin
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── ChannelSettingsTab ───────────────────────────────────────────────────────

function ChannelSettingsTab({ conversation }: { conversation: ActiveConversation }) {
  const [visibility, setVisibility] = React.useState<"public" | "private">(
    conversation.channelVisibility ?? "public"
  );

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5" data-testid="channel-settings-tab">
      {/* Channel name */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold" style={{ color: "#49454F" }}>
          Channel name
        </label>
        <div
          className="flex items-center gap-2 rounded-lg border bg-[#f8f9fc] px-3 py-2"
          style={{ borderColor: "#E0E0E0" }}
        >
          <Hash className="h-3.5 w-3.5 shrink-0 text-[#79747E]" />
          <span className="flex-1 text-xs" style={{ color: "#1C1B1F" }}>
            {conversation.name}
          </span>
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            aria-label="Edit channel name"
            data-testid="channel-name-edit-btn"
          >
            <Edit2 className="h-3 w-3 text-[#79747E]" />
          </button>
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold" style={{ color: "#49454F" }}>
          Description
        </label>
        <div
          className="flex items-start gap-2 rounded-lg border bg-[#f8f9fc] px-3 py-2"
          style={{ borderColor: "#E0E0E0" }}
        >
          <span className="flex-1 text-xs leading-relaxed" style={{ color: "#1C1B1F" }}>
            {conversation.subtitle.split("·")[0].trim()}
          </span>
          <button
            type="button"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            aria-label="Edit description"
            data-testid="channel-desc-edit-btn"
          >
            <Edit2 className="h-3 w-3 text-[#79747E]" />
          </button>
        </div>
      </div>

      {/* Visibility toggle */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold" style={{ color: "#49454F" }}>
          Visibility
        </label>
        <RadioPill
          name="channel-visibility-setting"
          options={[
            { value: "public", label: "Public" },
            { value: "private", label: "Private" },
          ]}
          value={visibility}
          onChange={(v) => setVisibility(v as "public" | "private")}
        />
      </div>

      {/* Divider */}
      <div className="h-px" style={{ background: "#F0F0F0" }} />

      {/* Archive */}
      <button
        type="button"
        className="w-full rounded-lg border px-4 py-2.5 text-xs font-semibold transition-colors hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        style={{ borderColor: "#E0E0E0", color: "#49454F" }}
        data-testid="channel-archive-btn"
      >
        <span className="flex items-center justify-center gap-2">
          <Archive className="h-3.5 w-3.5" />
          Archive channel
        </span>
      </button>

      {/* Delete */}
      <div className="space-y-1.5">
        <button
          type="button"
          className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-[#DC2626] transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          data-testid="channel-delete-btn"
        >
          <span className="flex items-center justify-center gap-2">
            <Trash2 className="h-3.5 w-3.5" />
            Delete channel
          </span>
        </button>
        <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-amber-600" />
          <p className="text-[10px] text-amber-700">
            This cannot be undone. Contact your admin.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface MessagingChannelDetailProps {
  conversation: ActiveConversation;
  onClose: () => void;
}

export function MessagingChannelDetail({
  conversation,
  onClose,
}: MessagingChannelDetailProps) {
  const [activeTab, setActiveTab] = React.useState<ChannelPanelTab>("info");

  return (
    <div
      className="flex flex-col h-full w-72 shrink-0 border-l bg-white overflow-hidden"
      style={{ borderColor: "#E0E0E0" }}
      data-testid="channel-detail-panel"
    >
      <ChannelDetailHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onClose={onClose}
        channelName={conversation.name}
      />

      {activeTab === "info" && <ChannelInfoTab conversation={conversation} />}
      {activeTab === "members" && <ChannelMembersTab />}
      {activeTab === "pinned" && <ChannelPinnedTab />}
      {activeTab === "settings" && <ChannelSettingsTab conversation={conversation} />}
    </div>
  );
}
