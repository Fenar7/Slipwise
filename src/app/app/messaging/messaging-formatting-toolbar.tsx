"use client";

import React from "react";
import {
  Bold,
  Italic,
  Strikethrough,
  Link2,
  List,
  Code2,
} from "lucide-react";

export interface FormatButton {
  label: string;
  icon: React.ElementType;
  testId: string;
}

export const FORMAT_BUTTONS: FormatButton[] = [
  { label: "Bold", icon: Bold, testId: "composer-fmt-bold" },
  { label: "Italic", icon: Italic, testId: "composer-fmt-italic" },
  { label: "Strikethrough", icon: Strikethrough, testId: "composer-fmt-strikethrough" },
  { label: "Link", icon: Link2, testId: "composer-fmt-link" },
  { label: "Bulleted list", icon: List, testId: "composer-fmt-list" },
  { label: "Code block", icon: Code2, testId: "composer-fmt-code" },
];

export interface FormattingToolbarProps {
  onFormat: (type: string) => void;
  testId?: string;
}

export function FormattingToolbar({ onFormat, testId = "composer-formatting-toolbar" }: FormattingToolbarProps) {
  return (
    <div
      className="flex items-center gap-0.5 border-b px-2 py-1.5"
      style={{ borderColor: "#F0F0F0" }}
      role="toolbar"
      aria-label="Text formatting"
      data-testid={testId}
    >
      {FORMAT_BUTTONS.map(({ label, icon: Icon, testId: btnTestId }) => (
        <button
          key={label}
          type="button"
          onClick={() => onFormat(label.toLowerCase())}
          className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
          aria-label={label}
          data-testid={btnTestId}
        >
          <Icon className="h-3.5 w-3.5" style={{ color: "#79747E" }} />
        </button>
      ))}
    </div>
  );
}
