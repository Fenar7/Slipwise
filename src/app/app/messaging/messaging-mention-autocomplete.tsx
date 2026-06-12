"use client";

import React from "react";
import { AtSign } from "lucide-react";
import { MOCK_PARTICIPANTS } from "./mock-data";

interface MessagingMentionAutocompleteProps {
  query?: string;
  onSelect: (name: string) => void;
  onClose: () => void;
}

export function MessagingMentionAutocomplete({
  query = "",
  onSelect,
  onClose,
}: MessagingMentionAutocompleteProps) {
  const filtered = MOCK_PARTICIPANTS.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      className="absolute z-30 w-64 rounded-lg border bg-white py-1 shadow-lg"
      style={{ borderColor: "#E0E0E0" }}
      data-testid="mention-autocomplete"
    >
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#79747E" }}>
        People
      </div>
      {filtered.map((p) => (
        <button
          key={p.id}
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:bg-gray-50"
          onClick={() => {
            onSelect(p.name);
            onClose();
          }}
          data-testid={`mention-option-${p.id}`}
        >
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold"
            style={{ color: "#49454F" }}
          >
            {p.avatarInitials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate" style={{ color: "#1C1B1F" }}>
              {p.name}
            </p>
            <p className="text-[10px] capitalize" style={{ color: "#79747E" }}>
              {p.role}
            </p>
          </div>
          <AtSign className="h-3 w-3 shrink-0" style={{ color: "#79747E" }} />
        </button>
      ))}
      {filtered.length === 0 && (
        <div className="px-3 py-2 text-xs" style={{ color: "#79747E" }}>
          No people found.
        </div>
      )}
    </div>
  );
}
