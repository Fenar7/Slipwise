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
import { useConversationList } from "./lib/use-conversation-list";
import { useConversationDetail } from "./lib/use-conversation-detail";
import { useSendMessage } from "./lib/use-send-message";
import { useSendThreadReply } from "./lib/use-send-thread-reply";
import { useMarkRead } from "./lib/use-mark-read";
import { useRealtimeBootstrap } from "./lib/use-realtime-bootstrap";
import {
  toFrontendChannel,
  toFrontendDM,
  toFrontendGroup,
  toActiveConversation,
  toFrontendMessages,
} from "./lib/mappers";
import type { ApiConversationSummary } from "./lib/mappers";
import { useCreateConversation } from "./lib/use-create-conversation";
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
  const [pendingCreateId, setPendingCreateId] = useState<string | null>(null);

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

  const handleConversationSelect = React.useCallback((conv: ActiveConversation) => {
    setActiveConversations((prev) => ({
      ...prev,
      [state.activeSection]: conv,
    }));
  }, [state.activeSection]);

  const activeConversation = activeConversations[state.activeSection] ?? null;

  const {
    channels: liveChannels,
    dms: liveDms,
    groups: liveGroups,
    loading: listLoading,
    error: listError,
    empty: listEmpty,
    refresh: refreshList,
  } = useConversationList();

  const activeConvId = activeConversation?.id ?? null;
  const { detail: activeDetail, refresh: refreshDetail, errorType: detailErrorType } = useConversationDetail(activeConvId);

  const { send: sendMessage, sending: sendingMessage, error: sendError, clearError: clearSendError } = useSendMessage();
  const { send: sendReply, sending: sendingReply, error: replyError, clearError: clearReplyError } = useSendThreadReply();
  const { markRead, marking: markingRead, error: markReadError } = useMarkRead();
  const lastMarkedRef = React.useRef<Record<string, number>>({});

  // Sprint 5.2: mark read when opening a conversation with unread messages.
  // Per-conversation tracking prevents re-marking unless unreadCount grows.
  // Only update lastMarkedRef on successful server write so failures can retry.
  React.useEffect(() => {
    if (!activeConvId || !activeDetail) return;
    const unread = activeDetail.readState?.unreadCount ?? 0;
    const lastMarked = lastMarkedRef.current[activeConvId] ?? -1;
    if (unread > 0 && unread !== lastMarked && !markingRead) {
      markRead(activeConvId).then((result) => {
        if (result) {
          lastMarkedRef.current[activeConvId] = unread;
          refreshList();
        }
      });
    }
  }, [activeConvId, activeDetail, markRead, markingRead, refreshList]);

  const { degraded: realtimeDegraded } = useRealtimeBootstrap();

  const { create: createConversation, creating: creatingConversation, error: createError, clearError: clearCreateError } = useCreateConversation();

  const enrichSelected = React.useCallback((summary: ApiConversationSummary, kind: "channel" | "dm" | "group"): ActiveConversation => {
    const conv = toActiveConversation(summary, kind);
    if (activeDetail && activeDetail.id === summary.id) {
      conv.canSend = activeDetail.canSend;
    }
    return conv;
  }, [activeDetail]);

  // Sprint 5.3: after creating a conversation, refresh the list and select it
  // when it appears in the hydrated summaries.
  React.useEffect(() => {
    if (!pendingCreateId) return;
    const all = [...liveChannels, ...liveDms, ...liveGroups];
    const found = all.find((c) => c.id === pendingCreateId);
    if (found) {
      const kind = found.type === "CHANNEL" ? "channel" : found.type === "DM" ? "dm" : "group";
      handleConversationSelect(enrichSelected(found, kind));
      setPendingCreateId(null);
    }
  }, [liveChannels, liveDms, liveGroups, pendingCreateId, handleConversationSelect, enrichSelected]);

  const sectionChannels = liveChannels.map((s) => toFrontendChannel(s));
  const sectionDms = liveDms.map((s) => toFrontendDM(s));
  const sectionGroups = liveGroups.map((s) => toFrontendGroup(s));

  const messages = activeDetail ? toFrontendMessages(activeDetail) : undefined;

  // Sprint 5.3: membership-sensitive transitions.
  // If the detail endpoint returns a restricted error, the current user is no
  // longer an active participant. Force the conversation into an inaccessible
  // state so the workspace renders the restricted pane instead of flashing
  // unauthorized detail.
  const displayConversation = React.useMemo(() => {
    if (!activeConversation) return null;
    if (detailErrorType === "restricted") {
      return {
        ...activeConversation,
        isAccessible: false,
        restrictedReason: "You no longer have access to this conversation.",
      };
    }
    return activeConversation;
  }, [activeConversation, detailErrorType]);

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
                {listLoading && (
                  <div className="flex flex-1 items-center justify-center">
                    <p className="text-xs text-gray-400">Loading conversations…</p>
                  </div>
                )}
                {listError && (
                  <div className="flex flex-1 items-center justify-center px-4 text-center">
                    <p className="text-xs font-semibold text-red-600">{listError}</p>
                  </div>
                )}
                {listEmpty && (
                  <div className="flex flex-1 items-center justify-center px-4 text-center">
                    <p className="text-xs font-semibold">No conversations yet</p>
                  </div>
                )}
                {!listLoading && !listError && !listEmpty && state.activeSection === "channels" && (
                  <ChannelConversationList
                    activeConversationId={activeConversation?.id ?? null}
                    onSelect={(conv) => {
                      const summary = liveChannels.find((c) => c.id === conv.id);
                      if (summary) handleConversationSelect(enrichSelected(summary, "channel"));
                    }}
                    channels={sectionChannels}
                    onCreateChannel={async (payload) => {
                      clearCreateError();
                      const result = await createConversation("CHANNEL", payload);
                      if (result) {
                        handleConversationSelect({
                          id: result.id,
                          kind: "channel",
                          name: result.name ?? "New channel",
                          subtitle: "",
                          channelVisibility: payload.visibility === "PRIVATE" ? "private" : "public",
                          isAccessible: true,
                          threadOpen: false,
                          threadAnchorMessageId: null,
                        });
                        refreshList();
                      }
                    }}
                    creatingChannel={creatingConversation}
                  />
                )}
                {!listLoading && !listError && !listEmpty && state.activeSection === "dms" && (
                  <DMConversationList
                    activeConversationId={activeConversation?.id ?? null}
                    onSelect={(conv) => {
                      const summary = liveDms.find((c) => c.id === conv.id);
                      if (summary) handleConversationSelect(enrichSelected(summary, "dm"));
                    }}
                    dms={sectionDms}
                    onCreateDM={async (dmPeerId) => {
                      clearCreateError();
                      const result = await createConversation("DM", { dmPeerId });
                      if (result) {
                        handleConversationSelect({
                          id: result.id,
                          kind: "dm",
                          name: result.name ?? "Direct message",
                          subtitle: "Direct message",
                          isAccessible: true,
                          threadOpen: false,
                          threadAnchorMessageId: null,
                        });
                        refreshList();
                      }
                    }}
                    creatingDM={creatingConversation}
                  />
                )}
                {!listLoading && !listError && !listEmpty && state.activeSection === "groups" && (
                  <GroupConversationList
                    activeConversationId={activeConversation?.id ?? null}
                    onSelect={(conv) => {
                      const summary = liveGroups.find((c) => c.id === conv.id);
                      if (summary) handleConversationSelect(enrichSelected(summary, "group"));
                    }}
                    groups={sectionGroups}
                    onCreateGroup={async (payload) => {
                      clearCreateError();
                      const result = await createConversation("GROUP", payload);
                      if (result) {
                        handleConversationSelect({
                          id: result.id,
                          kind: "group",
                          name: result.name ?? "New group",
                          subtitle: "",
                          groupMemberCount: 1,
                          groupIsPrivate: payload.visibility === "PRIVATE",
                          isAccessible: true,
                          threadOpen: false,
                          threadAnchorMessageId: null,
                        });
                        refreshList();
                      }
                    }}
                    creatingGroup={creatingConversation}
                  />
                )}
              </div>

              {/* Reading workspace */}
              <div className="flex min-h-0 flex-1 overflow-hidden">
                <MessagingReadingWorkspace
                  conversation={displayConversation}
                  sectionKind={
                    state.activeSection === "channels"
                      ? "channel"
                      : state.activeSection === "dms"
                      ? "dm"
                      : "group"
                  }
                  degraded={realtimeDegraded}
                  messages={messages}
                  detail={activeDetail}
                  canSend={activeDetail?.canSend ?? activeConversation?.canSend ?? true}
                  sending={sendingMessage}
                  sendError={sendError}
                  onSend={async (body: string, threadId?: string | null) => {
                    clearSendError();
                    const result = await sendMessage(activeConvId!, body, threadId);
                    if (result && activeConvId) {
                      await refreshDetail();
                      await refreshList();
                    }
                    return result;
                  }}
                  onReply={async (threadId: string, body: string) => {
                    clearReplyError();
                    const result = await sendReply(activeConvId!, threadId, body);
                    if (result && activeConvId) {
                      await refreshDetail();
                      await refreshList();
                    }
                    return result;
                  }}
                  sendingReply={sendingReply}
                  replyError={replyError}
                  onRefreshDetail={async () => {
                    await refreshDetail();
                    await refreshList();
                  }}
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
