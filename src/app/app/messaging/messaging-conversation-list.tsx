"use client";

/**
 * MessagingConversationList — Sprint 1.2
 *
 * The conversation list / inbox column rendered inside the channels, DMs, and
 * groups sections. Sits between the left rail and the reading workspace.
 *
 * Design intent:
 * - Compact, scannable rows with unread state, presence, and last-activity cues
 * - Channels, DMs, and groups each have distinct row anatomy
 * - Active conversation is clearly highlighted
 * - Restricted/private access is visually hinted
 * - Shape is forward-compatible with real conversation data in later phases
 */

import React from "react";
import { cn } from "@/lib/utils";
import {
  Hash,
  Lock,
  Users,
  Search,
  Plus,
} from "lucide-react";
import type {
  MessagingChannel,
  DirectMessage,
  MessagingGroup,
  ActiveConversation,
  PresenceStatus,
} from "./types";
import {
  MOCK_CHANNELS,
  MOCK_DMS,
  MOCK_GROUPS,
} from "./mock-data";
import { MessagingChannelCreate } from "./messaging-channel-create";
import { MessagingGroupCreate } from "./messaging-group-create";

// ─── Shared primitives ────────────────────────────────────────────────────────

function PresenceDot({ status }: { status: PresenceStatus }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full shrink-0",
        status === "online" && "bg-emerald-500",
        status === "away" && "bg-amber-400",
        status === "offline" && "bg-gray-300"
      )}
      aria-label={status}
    />
  );
}

function UnreadPip({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      className="ml-auto flex h-4.5 min-w-[1.125rem] items-center justify-center rounded-full bg-[#DC2626] px-1 text-[10px] font-bold text-white leading-none"
      aria-label={`${count} unread`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// ─── List header ──────────────────────────────────────────────────────────────

interface ListHeaderProps {
  title: string;
  subtitle: string;
  actionLabel: string;
  onAction: () => void;
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (v: string) => void;
}

function ListHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
  searchPlaceholder,
  searchValue,
  onSearchChange,
}: ListHeaderProps) {
  return (
    <div
      className="shrink-0 border-b bg-white"
      style={{ borderColor: "#E0E0E0" }}
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <h2 className="text-sm font-bold" style={{ color: "#1C1B1F" }}>
            {title}
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: "#79747E" }}>
            {subtitle}
          </p>
        </div>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-red-50 hover:text-[#DC2626] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          style={{ color: "#79747E" }}
          aria-label={actionLabel}
          title={actionLabel}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {/* Inline search */}
      <div className="px-3 pb-3">
        <div
          className="flex items-center gap-2 rounded-lg border bg-[#f8f9fc] px-2.5 py-1.5"
          style={{ borderColor: "#E8E8E8" }}
        >
          <Search className="h-3 w-3 shrink-0" style={{ color: "#79747E" }} />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-[#79747E]"
            style={{ color: "#1C1B1F" }}
            aria-label={searchPlaceholder}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Channel list ─────────────────────────────────────────────────────────────

interface ChannelListProps {
  activeConversationId: string | null;
  onSelect: (conv: ActiveConversation) => void;
}

export function ChannelConversationList({
  activeConversationId,
  onSelect,
}: ChannelListProps) {
  const [search, setSearch] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);

  const filtered = MOCK_CHANNELS.filter((ch) =>
    ch.name.toLowerCase().includes(search.toLowerCase())
  );

  const pinned = filtered.filter((ch) => ch.isPinned);
  const rest = filtered.filter((ch) => !ch.isPinned);

  function handleSelect(ch: MessagingChannel) {
    onSelect({
      id: ch.id,
      kind: "channel",
      name: ch.name,
      subtitle: `${ch.description} · ${ch.memberCount} members`,
      channelVisibility: ch.visibility,
      isAccessible: true,
      threadOpen: false,
      threadAnchorMessageId: null,
    });
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      data-testid="conv-list-channels"
    >
      <ListHeader
        title="Channels"
        subtitle={`${MOCK_CHANNELS.length} channels · ${MOCK_CHANNELS.filter((c) => c.visibility === "private").length} private`}
        actionLabel="New channel"
        onAction={() => setShowCreate(true)}
        searchPlaceholder="Find a channel…"
        searchValue={search}
        onSearchChange={setSearch}
      />
      <div className="flex-1 overflow-y-auto py-1">
        {pinned.length > 0 && (
          <SectionDivider label="Pinned" />
        )}
        {pinned.map((ch) => (
          <ChannelRow
            key={ch.id}
            channel={ch}
            isActive={activeConversationId === ch.id}
            onSelect={handleSelect}
          />
        ))}
        {rest.length > 0 && pinned.length > 0 && (
          <SectionDivider label="All channels" />
        )}
        {rest.map((ch) => (
          <ChannelRow
            key={ch.id}
            channel={ch}
            isActive={activeConversationId === ch.id}
            onSelect={handleSelect}
          />
        ))}
        {filtered.length === 0 && (
          <EmptySearch label="No channels match your search." />
        )}
        <div className="px-3 py-2">
          <button
            type="button"
            className="w-full rounded-lg border border-dashed px-3 py-2 text-xs font-medium transition-colors hover:border-[#DC2626] hover:text-[#DC2626] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            style={{ borderColor: "#E0E0E0", color: "#79747E" }}
          >
            Browse all channels…
          </button>
        </div>
      </div>
      {showCreate && <MessagingChannelCreate onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function ChannelRow({
  channel,
  isActive,
  onSelect,
}: {
  channel: MessagingChannel;
  isActive: boolean;
  onSelect: (ch: MessagingChannel) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#DC2626]",
        isActive
          ? "bg-red-50 text-[#DC2626]"
          : "text-[#49454F] hover:bg-gray-50 hover:text-[#1C1B1F]"
      )}
      onClick={() => onSelect(channel)}
      aria-pressed={isActive}
      aria-label={`${channel.name} channel${channel.unreadCount > 0 ? `, ${channel.unreadCount} unread` : ""}`}
      data-testid={`conv-row-channel-${channel.id}`}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          isActive ? "bg-red-100" : "bg-gray-100"
        )}
      >
        {channel.visibility === "private" ? (
          <Lock
            className={cn("h-3.5 w-3.5", isActive ? "text-[#DC2626]" : "text-[#79747E]")}
          />
        ) : (
          <Hash
            className={cn("h-3.5 w-3.5", isActive ? "text-[#DC2626]" : "text-[#79747E]")}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate text-xs",
              channel.unreadCount > 0 ? "font-bold text-[#1C1B1F]" : "font-medium",
              isActive && "text-[#DC2626] font-bold"
            )}
          >
            {channel.name}
          </span>
          {channel.visibility === "private" && !isActive && (
            <span className="shrink-0 rounded-full bg-gray-100 px-1 py-0.5 text-[9px] font-medium text-[#79747E]">
              Private
            </span>
          )}
        </div>
        <p className="text-[10px] truncate mt-0.5" style={{ color: "#79747E" }}>
          {relativeTime(channel.lastActivityAt)} · {channel.memberCount} members
        </p>
      </div>
      <UnreadPip count={channel.unreadCount} />
    </button>
  );
}

// ─── DM list ──────────────────────────────────────────────────────────────────

interface DMListProps {
  activeConversationId: string | null;
  onSelect: (conv: ActiveConversation) => void;
}

export function DMConversationList({ activeConversationId, onSelect }: DMListProps) {
  const [search, setSearch] = React.useState("");

  const filtered = MOCK_DMS.filter((dm) =>
    dm.participant.name.toLowerCase().includes(search.toLowerCase())
  );

  function handleSelect(dm: DirectMessage) {
    onSelect({
      id: dm.id,
      kind: "dm",
      name: dm.participant.name,
      subtitle: `${dm.participant.role === "admin" ? "Admin" : dm.participant.role === "owner" ? "Owner" : "Member"} · ${dm.participant.presence === "online" ? "Online" : dm.participant.presence === "away" ? "Away" : "Offline"}`,
      dmParticipant: dm.participant,
      isAccessible: true,
      threadOpen: false,
      threadAnchorMessageId: null,
    });
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      data-testid="conv-list-dms"
    >
      <ListHeader
        title="Direct Messages"
        subtitle={`${MOCK_DMS.length} conversations`}
        actionLabel="New direct message"
        onAction={() => {}}
        searchPlaceholder="Find a person…"
        searchValue={search}
        onSearchChange={setSearch}
      />
      <div className="flex-1 overflow-y-auto py-1">
        {filtered.map((dm) => (
          <DMRow
            key={dm.id}
            dm={dm}
            isActive={activeConversationId === dm.id}
            onSelect={handleSelect}
          />
        ))}
        {filtered.length === 0 && (
          <EmptySearch label="No conversations match your search." />
        )}
        <div className="px-3 py-2">
          <button
            type="button"
            className="w-full rounded-lg border border-dashed px-3 py-2 text-xs font-medium transition-colors hover:border-[#DC2626] hover:text-[#DC2626] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            style={{ borderColor: "#E0E0E0", color: "#79747E" }}
          >
            Start a new message…
          </button>
        </div>
      </div>
    </div>
  );
}

function DMRow({
  dm,
  isActive,
  onSelect,
}: {
  dm: DirectMessage;
  isActive: boolean;
  onSelect: (dm: DirectMessage) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#DC2626]",
        isActive
          ? "bg-red-50 text-[#DC2626]"
          : "text-[#49454F] hover:bg-gray-50 hover:text-[#1C1B1F]"
      )}
      onClick={() => onSelect(dm)}
      aria-pressed={isActive}
      aria-label={`DM with ${dm.participant.name}${dm.unreadCount > 0 ? `, ${dm.unreadCount} unread` : ""}`}
      data-testid={`conv-row-dm-${dm.id}`}
    >
      {/* Avatar with presence ring */}
      <div className="relative shrink-0">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
            isActive ? "bg-red-100 text-[#DC2626]" : "bg-gray-200 text-[#49454F]"
          )}
        >
          {dm.participant.avatarInitials}
        </div>
        <PresenceDot
          status={dm.participant.presence}
        />
        {/* Presence dot positioned bottom-right */}
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white",
            dm.participant.presence === "online" && "bg-emerald-500",
            dm.participant.presence === "away" && "bg-amber-400",
            dm.participant.presence === "offline" && "bg-gray-300"
          )}
          aria-hidden="true"
        />
      </div>
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            "block truncate text-xs",
            dm.unreadCount > 0 ? "font-bold text-[#1C1B1F]" : "font-medium",
            isActive && "text-[#DC2626] font-bold"
          )}
        >
          {dm.participant.name}
        </span>
        <p className="text-[10px] mt-0.5" style={{ color: "#79747E" }}>
          {relativeTime(dm.lastActivityAt)}
        </p>
      </div>
      <UnreadPip count={dm.unreadCount} />
    </button>
  );
}

// ─── Group list ───────────────────────────────────────────────────────────────

interface GroupListProps {
  activeConversationId: string | null;
  onSelect: (conv: ActiveConversation) => void;
}

export function GroupConversationList({ activeConversationId, onSelect }: GroupListProps) {
  const [search, setSearch] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);

  const filtered = MOCK_GROUPS.filter((grp) =>
    grp.name.toLowerCase().includes(search.toLowerCase())
  );

  function handleSelect(grp: MessagingGroup) {
    onSelect({
      id: grp.id,
      kind: "group",
      name: grp.name,
      subtitle: `${grp.isPrivate ? "Private group" : "Group"} · ${grp.memberCount} members`,
      groupMemberCount: grp.memberCount,
      groupIsPrivate: grp.isPrivate,
      isAccessible: true,
      threadOpen: false,
      threadAnchorMessageId: null,
    });
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      data-testid="conv-list-groups"
    >
      <ListHeader
        title="Groups"
        subtitle={`${MOCK_GROUPS.length} groups · ${MOCK_GROUPS.filter((g) => g.isPrivate).length} private`}
        actionLabel="New group"
        onAction={() => setShowCreate(true)}
        searchPlaceholder="Find a group…"
        searchValue={search}
        onSearchChange={setSearch}
      />
      <div className="flex-1 overflow-y-auto py-1">
        {filtered.map((grp) => (
          <GroupRow
            key={grp.id}
            group={grp}
            isActive={activeConversationId === grp.id}
            onSelect={handleSelect}
          />
        ))}
        {filtered.length === 0 && (
          <EmptySearch label="No groups match your search." />
        )}
      </div>
      {showCreate && <MessagingGroupCreate onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function GroupRow({
  group,
  isActive,
  onSelect,
}: {
  group: MessagingGroup;
  isActive: boolean;
  onSelect: (grp: MessagingGroup) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#DC2626]",
        isActive
          ? "bg-red-50 text-[#DC2626]"
          : "text-[#49454F] hover:bg-gray-50 hover:text-[#1C1B1F]"
      )}
      onClick={() => onSelect(group)}
      aria-pressed={isActive}
      aria-label={`${group.name} group${group.unreadCount > 0 ? `, ${group.unreadCount} unread` : ""}`}
      data-testid={`conv-row-group-${group.id}`}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          isActive ? "bg-red-100" : "bg-gray-100"
        )}
      >
        {group.isPrivate ? (
          <Lock
            className={cn("h-3.5 w-3.5", isActive ? "text-[#DC2626]" : "text-[#79747E]")}
          />
        ) : (
          <Users
            className={cn("h-3.5 w-3.5", isActive ? "text-[#DC2626]" : "text-[#79747E]")}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate text-xs",
              group.unreadCount > 0 ? "font-bold text-[#1C1B1F]" : "font-medium",
              isActive && "text-[#DC2626] font-bold"
            )}
          >
            {group.name}
          </span>
          {group.isPrivate && !isActive && (
            <span className="shrink-0 rounded-full bg-gray-100 px-1 py-0.5 text-[9px] font-medium text-[#79747E]">
              Private
            </span>
          )}
        </div>
        <p className="text-[10px] mt-0.5" style={{ color: "#79747E" }}>
          {relativeTime(group.lastActivityAt)} · {group.memberCount} members
        </p>
      </div>
      <UnreadPip count={group.unreadCount} />
    </button>
  );
}

// ─── Shared utilities ─────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="px-3 pt-3 pb-1">
      <p
        className="text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: "#79747E" }}
      >
        {label}
      </p>
    </div>
  );
}

function EmptySearch({ label }: { label: string }) {
  return (
    <div className="px-4 py-6 text-center">
      <p className="text-xs" style={{ color: "#79747E" }}>
        {label}
      </p>
    </div>
  );
}
