"use client";

import React from "react";
import {
  Smile,
  MessageSquare,
  Pin,
  Flag,
  Trash2,
  Copy,
  MoreHorizontal,
} from "lucide-react";

interface MessagingMessageActionsProps {
  onClose: () => void;
}

const ACTIONS = [
  { label: "React", icon: Smile, testId: "msg-action-react" },
  { label: "Reply in thread", icon: MessageSquare, testId: "msg-action-reply" },
  { label: "Pin message", icon: Pin, testId: "msg-action-pin" },
  { label: "Copy text", icon: Copy, testId: "msg-action-copy" },
  { label: "Report", icon: Flag, testId: "msg-action-report" },
  { label: "Delete", icon: Trash2, testId: "msg-action-delete" },
];

export function MessagingMessageActions({ onClose }: MessagingMessageActionsProps) {
  return (
    <div
      className="absolute z-30 w-48 rounded-lg border bg-white py-1 shadow-lg"
      style={{ borderColor: "#E0E0E0" }}
      data-testid="message-actions-menu"
      role="menu"
    >
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.testId}
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:bg-gray-50"
            style={{ color: action.testId === "msg-action-delete" ? "#DC2626" : "#49454F" }}
            data-testid={action.testId}
            onClick={onClose}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
