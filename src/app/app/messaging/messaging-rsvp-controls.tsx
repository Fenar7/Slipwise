"use client";

import { useState, useTransition } from "react";

export type RsvpStatus = "ACCEPTED" | "TENTATIVE" | "DECLINED" | "PENDING";

interface MeetingRsvpControlsProps {
  meetingId: string;
  currentStatus: RsvpStatus;
  /** Whether the conversation is archived/locked — blocks mutations. */
  isMutationBlocked: boolean;
  onStatusChange?: (newStatus: RsvpStatus) => void;
}

const LABELS: Record<Exclude<RsvpStatus, "PENDING">, string> = {
  ACCEPTED: "Accept",
  TENTATIVE: "Maybe",
  DECLINED: "Decline",
};

const ACTIVE_CLASSES: Record<Exclude<RsvpStatus, "PENDING">, string> = {
  ACCEPTED: "bg-emerald-600 text-white border-emerald-600",
  TENTATIVE: "bg-amber-500 text-white border-amber-500",
  DECLINED: "bg-red-600 text-white border-red-600",
};

const INACTIVE_CLASSES =
  "bg-white text-gray-700 border-gray-200 hover:bg-gray-50";

/**
 * RSVP action buttons for a meeting inside messaging.
 * Reflects persisted server state — not local-only toggle.
 * Mutations POST to /api/messaging/meetings/[meetingId]/rsvp.
 */
export function MeetingRsvpControls({
  meetingId,
  currentStatus,
  isMutationBlocked,
  onStatusChange,
}: MeetingRsvpControlsProps) {
  const [status, setStatus] = useState<RsvpStatus>(currentStatus);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleRsvp(newStatus: Exclude<RsvpStatus, "PENDING">) {
    if (isMutationBlocked) return;
    if (status === newStatus) return;

    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/messaging/meetings/${meetingId}/rsvp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rsvpStatus: newStatus }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError((data as { error?: string }).error ?? "Failed to update RSVP");
          return;
        }

        const data = await res.json();
        const persisted = (data as { rsvpStatus?: RsvpStatus }).rsvpStatus ?? newStatus;
        setStatus(persisted);
        onStatusChange?.(persisted);
      } catch {
        setError("Network error — please try again");
      }
    });
  }

  const actions = ["ACCEPTED", "TENTATIVE", "DECLINED"] as const;

  return (
    <div data-testid="meeting-rsvp-controls" className="flex flex-col gap-1">
      <div className="flex gap-1.5">
        {actions.map((action) => {
          const isActive = status === action;
          return (
            <button
              key={action}
              type="button"
              data-testid={`rsvp-btn-${action.toLowerCase()}`}
              disabled={isPending || isMutationBlocked}
              onClick={() => handleRsvp(action)}
              aria-pressed={isActive}
              className={[
                "rounded-lg border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                "focus-visible:ring-[#DC2626]",
                isActive ? ACTIVE_CLASSES[action] : INACTIVE_CLASSES,
                isPending || isMutationBlocked
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer",
              ].join(" ")}
            >
              {LABELS[action]}
            </button>
          );
        })}
      </div>

      {isMutationBlocked && (
        <p className="text-[10px] text-gray-500" data-testid="rsvp-blocked-note">
          RSVP is unavailable in archived or locked conversations.
        </p>
      )}

      {error && (
        <p className="text-[10px] text-red-600" data-testid="rsvp-error">
          {error}
        </p>
      )}

      {status === "PENDING" && !isMutationBlocked && (
        <p className="text-[10px] text-gray-400" data-testid="rsvp-pending-note">
          You haven&apos;t responded yet.
        </p>
      )}
    </div>
  );
}
