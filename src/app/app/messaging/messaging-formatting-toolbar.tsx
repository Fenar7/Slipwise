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

export function formatMarkdownSyntax(type: string, selectedText: string): string {
  switch (type) {
    case "bold":
      return `**${selectedText || "bold text"}**`;
    case "italic":
      return `*${selectedText || "italic text"}*`;
    case "strikethrough":
      return `~~${selectedText || "strikethrough text"}~~`;
    case "link":
      return `[${selectedText || "link text"}](https://example.com)`;
    case "bulleted list":
    case "list":
      return `\n- ${selectedText || "list item"}`;
    case "code block":
    case "code":
      return `\`\`\`\n${selectedText || "code"}\n\`\`\``;
    default:
      return selectedText;
  }
}

export function applyComposerFormat(
  type: string,
  editorRef: React.RefObject<HTMLDivElement>,
  setState: (value: string) => void,
) {
  if (!editorRef.current) return;
  editorRef.current.focus();
  const selection = window.getSelection();
  if (!selection) return;
  let selectedText = "";
  let range: Range | null = null;
  if (selection.rangeCount > 0) {
    range = selection.getRangeAt(0);
    if (editorRef.current.contains(range.commonAncestorContainer)) {
      selectedText = range.toString();
    }
  }
  const formattedText = formatMarkdownSyntax(type, selectedText);
  if (range && editorRef.current.contains(range.commonAncestorContainer)) {
    range.deleteContents();
    const textNode = document.createTextNode(formattedText);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    const textNode = document.createTextNode(formattedText);
    editorRef.current.appendChild(textNode);
  }
  const newContent = editorRef.current.textContent ?? "";
  setState(newContent);
}

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
