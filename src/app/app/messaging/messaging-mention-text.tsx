"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface MentionTextProps {
  text: string;
  className?: string;
}

/**
 * Parses @username mentions in message text and renders them as styled pills.
 * Non-mention text is rendered as regular spans.
 */
export function MentionText({ text, className }: MentionTextProps) {
  // Split capturing @mentions with full names (spaces allowed, stops before punctuation or end)
  const parts = text.split(/(@[A-Za-z]+(?:\s[A-Za-z]+)*)/g);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.startsWith("@")) {
          return (
            <span
              key={i}
              className={cn(
                "inline-flex items-center rounded px-1 py-0.5 text-sm font-medium",
                "bg-[#EFF6FF] text-[#2563EB]"
              )}
              data-testid="message-mention"
            >
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
