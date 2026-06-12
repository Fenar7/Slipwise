"use client";

import React from "react";

const EMOJI_CATEGORIES = [
  { name: "Smileys", emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩"] },
  { name: "Gestures", emojis: ["👍", "👎", "👏", "🙌", "🤝", "🤞", "✌️", "🤘", "👌", "🤙", "💪", "🙏", "👋", "✋", "🖐️", "👊"] },
  { name: "Objects", emojis: ["🔥", "💯", "⭐", "✅", "❌", "💡", "📎", "📌", "🔔", "🎉", "🎁", "💰", "📊", "📈", "🗂️", "📎"] },
];

interface MessagingEmojiPickerProps {
  onClose: () => void;
}

export function MessagingEmojiPicker({ onClose }: MessagingEmojiPickerProps) {
  return (
    <div
      className="absolute z-30 w-72 rounded-lg border bg-white p-3 shadow-lg"
      style={{ borderColor: "#E0E0E0" }}
      data-testid="emoji-picker"
    >
      {/* Search */}
      <input
        type="text"
        placeholder="Search emoji"
        className="w-full rounded-md border px-2 py-1 text-xs outline-none"
        style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
        data-testid="emoji-picker-search"
      />

      {/* Categories */}
      <div className="mt-2 space-y-2">
        {EMOJI_CATEGORIES.map((cat) => (
          <div key={cat.name}>
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#79747E" }}>
              {cat.name}
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {cat.emojis.map((emoji) => (
                <button
                  key={`${cat.name}-${emoji}`}
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded text-base transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
                  onClick={onClose}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
