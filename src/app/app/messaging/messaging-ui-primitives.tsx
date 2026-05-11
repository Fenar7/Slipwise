"use client";

/**
 * Shared UI primitives for the Messaging module.
 * Import from this file rather than copy-pasting into individual components.
 */

import React from "react";
import { cn } from "@/lib/utils";

// ─── RadioPill ────────────────────────────────────────────────────────────────

export interface RadioPillOption { value: string; label: string }

export interface RadioPillProps {
  options: RadioPillOption[];
  value: string;
  onChange: (v: string) => void;
  name: string;
}

export function RadioPill({ options, value, onChange, name }: RadioPillProps) {
  return (
    <div
      className="flex rounded-lg border p-0.5 gap-0.5"
      style={{ borderColor: "#E0E0E0" }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]",
            value === opt.value
              ? "bg-[#DC2626] text-white"
              : "text-[#79747E] hover:bg-gray-100"
          )}
          data-testid={`${name}-${opt.value}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
