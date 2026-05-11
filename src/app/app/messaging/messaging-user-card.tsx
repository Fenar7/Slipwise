"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { MessageSquare, Mail, Phone, Video } from "lucide-react";
import type { MessagingParticipant } from "./types";

interface MessagingUserCardProps {
  user: MessagingParticipant;
  onClose: () => void;
}

export function MessagingUserCard({ user, onClose }: MessagingUserCardProps) {
  return (
    <div
      className="absolute z-30 w-64 rounded-xl border bg-white p-4 shadow-lg"
      style={{ borderColor: "#E0E0E0" }}
      data-testid="user-card"
      onMouseLeave={onClose}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-bold"
          style={{ color: "#49454F" }}
        >
          {user.avatarInitials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: "#1C1B1F" }}>
            {user.name}
          </p>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                user.presence === "online" && "bg-emerald-500",
                user.presence === "away" && "bg-amber-400",
                user.presence === "offline" && "bg-gray-300"
              )}
            />
            <span className="text-[10px] capitalize" style={{ color: "#79747E" }}>
              {user.presence}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] capitalize" style={{ color: "#79747E" }}>
            {user.role}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-3 flex gap-1.5">
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          style={{ borderColor: "#E0E0E0", color: "#49454F" }}
          data-testid="user-card-message"
        >
          <MessageSquare className="h-3 w-3" />
          Message
        </button>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-lg border transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          style={{ borderColor: "#E0E0E0", color: "#49454F" }}
          data-testid="user-card-email"
        >
          <Mail className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-lg border transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          style={{ borderColor: "#E0E0E0", color: "#49454F" }}
          data-testid="user-card-call"
        >
          <Phone className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-lg border transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          style={{ borderColor: "#E0E0E0", color: "#49454F" }}
          data-testid="user-card-video"
        >
          <Video className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
