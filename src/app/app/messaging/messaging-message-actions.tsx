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
  Pencil,
  CheckSquare,
} from "lucide-react";

interface MessagingMessageActionsProps {
  onClose: () => void;
  onReact?: () => void;
  onReply?: () => void;
  onPin?: () => void;
  onCopy?: () => void;
  onReport?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onCreateTask?: () => void;
}

export function MessagingMessageActions({
  onClose,
  onReact,
  onReply,
  onPin,
  onCopy,
  onReport,
  onDelete,
  onEdit,
  onCreateTask,
}: MessagingMessageActionsProps) {
  const actions = [
    { label: "React", icon: Smile, testId: "msg-action-react", onClick: onReact },
    { label: "Reply in thread", icon: MessageSquare, testId: "msg-action-reply", onClick: onReply },
    { label: "Edit", icon: Pencil, testId: "msg-action-edit", onClick: onEdit },
    { label: "Pin message", icon: Pin, testId: "msg-action-pin", onClick: onPin },
    { label: "Copy text", icon: Copy, testId: "msg-action-copy", onClick: onCopy },
    ...(onCreateTask ? [{ label: "Create task", icon: CheckSquare, testId: "msg-action-create-task", onClick: onCreateTask }] : []),
    { label: "Report", icon: Flag, testId: "msg-action-report", onClick: onReport },
    { label: "Delete", icon: Trash2, testId: "msg-action-delete", onClick: onDelete, danger: true },
  ];

  return (
    <div
      className="absolute z-30 w-48 rounded-lg border bg-white py-1 shadow-lg"
      style={{ borderColor: "#E0E0E0" }}
      data-testid="message-actions-menu"
      role="menu"
    >
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.testId}
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:bg-gray-50"
            style={{ color: action.danger ? "#DC2626" : "#49454F" }}
            data-testid={action.testId}
            onClick={() => {
              action.onClick?.();
              onClose();
            }}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
