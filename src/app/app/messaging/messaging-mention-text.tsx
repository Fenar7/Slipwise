"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface MentionTextProps {
  text: string;
  className?: string;
}

function parseInlineText(inlineText: string): React.ReactNode[] {
  const regex = /(@[A-Za-z]+(?:\s[A-Za-z]+){0,1}(?=\s|$|[.,;:!?]))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(~~[^~]+~~)|(`[^`]+`)|(\[[^\]]+\]\([^)]+\))/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(inlineText)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`text-${lastIndex}`}>{inlineText.slice(lastIndex, match.index)}</span>);
    }

    const part = match[0];
    const i = parts.length;

    if (part.startsWith("@")) {
      parts.push(
        <span
          key={`mention-${i}`}
          className={cn(
            "inline-flex items-center rounded px-1 py-0.5 text-sm font-medium",
            "bg-[#EFF6FF] text-[#2563EB]"
          )}
          data-testid="message-mention"
        >
          {part}
        </span>
      );
      lastIndex = regex.lastIndex;
      continue;
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      parts.push(<strong key={`bold-${i}`} className="font-bold">{parseInlineText(part.slice(2, -2))}</strong>);
      lastIndex = regex.lastIndex;
      continue;
    }

    if (part.startsWith("*") && part.endsWith("*")) {
      parts.push(<em key={`italic-${i}`} className="italic">{parseInlineText(part.slice(1, -1))}</em>);
      lastIndex = regex.lastIndex;
      continue;
    }

    if (part.startsWith("~~") && part.endsWith("~~")) {
      parts.push(<del key={`strike-${i}`} className="line-through">{parseInlineText(part.slice(2, -2))}</del>);
      lastIndex = regex.lastIndex;
      continue;
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      parts.push(
        <code key={`code-${i}`} className="bg-gray-100 rounded px-1 py-0.5 text-xs font-mono text-red-600">
          {part.slice(1, -1)}
        </code>
      );
      lastIndex = regex.lastIndex;
      continue;
    }

    if (part.startsWith("[") && part.includes("](")) {
      const separatorIdx = part.indexOf("](");
      if (separatorIdx !== -1) {
        const label = part.slice(1, separatorIdx);
        const url = part.slice(separatorIdx + 2, -1);
        const isSafeUrl =
          url.startsWith("http://") ||
          url.startsWith("https://") ||
          url.startsWith("/") ||
          url.startsWith("mailto:");
        if (isSafeUrl && url.length > 0) {
          parts.push(
            <a
              key={`link-${i}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              {label}
            </a>
          );
          lastIndex = regex.lastIndex;
          continue;
        }
      }
    }

    parts.push(<span key={`fallback-${i}`}>{part}</span>);
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < inlineText.length) {
    parts.push(<span key={`tail-${lastIndex}`}>{inlineText.slice(lastIndex)}</span>);
  }

  return parts;
}

/**
 * Securely parses markdown-like rich content in message bodies and renders
 * it as React nodes. Never uses dangerouslySetInnerHTML.
 */
export function MentionText({ text, className }: MentionTextProps) {
  const codeBlockRegex = /```([\s\S]*?)```/g;
  const segments: React.ReactNode[] = [];
  let lastIdx = 0;
  let cbMatch;
  let segIndex = 0;

  while ((cbMatch = codeBlockRegex.exec(text)) !== null) {
    if (cbMatch.index > lastIdx) {
      const before = text.slice(lastIdx, cbMatch.index);
      segments.push(renderBlockLines(before, segIndex++));
    }
    const code = cbMatch[1];
    segments.push(
      <pre key={`pre-${segIndex++}`} className="bg-gray-900 text-gray-100 rounded-lg p-3 my-1 overflow-x-auto">
        <code className="text-xs font-mono whitespace-pre">{code}</code>
      </pre>
    );
    lastIdx = codeBlockRegex.lastIndex;
  }

  if (lastIdx < text.length) {
    segments.push(renderBlockLines(text.slice(lastIdx), segIndex++));
  }

  if (segments.length === 0) {
    segments.push(renderBlockLines(text, 0));
  }

  return (
    <div className={cn("block space-y-1.5", className)}>
      {segments}
    </div>
  );
}

function renderBlockLines(blockText: string, blockKey: number): React.ReactNode {
  const lines = blockText.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bulletMatch = line.match(/^(\s*)-\s+(.*)$/);

    if (bulletMatch) {
      currentList.push(bulletMatch[2]);
    } else {
      if (currentList.length > 0) {
        elements.push(
          <ul key={`list-${blockKey}-${i}`} className="list-disc pl-5 my-1" data-testid="message-bullet-list">
            {currentList.map((item, idx) => (
              <li key={`li-${idx}`} className="text-sm leading-relaxed text-left">
                {parseInlineText(item)}
              </li>
            ))}
          </ul>
        );
        currentList = [];
      }

      if (line.trim().length > 0) {
        elements.push(
          <p key={`p-${blockKey}-${i}`} className="my-0.5 text-sm leading-relaxed text-left">
            {parseInlineText(line)}
          </p>
        );
      }
    }
  }

  if (currentList.length > 0) {
    elements.push(
      <ul key={`list-${blockKey}-end`} className="list-disc pl-5 my-1" data-testid="message-bullet-list">
        {currentList.map((item, idx) => (
          <li key={`li-${idx}`} className="text-sm leading-relaxed text-left">
            {parseInlineText(item)}
          </li>
        ))}
      </ul>
    );
  }

  return <React.Fragment key={`block-${blockKey}`}>{elements}</React.Fragment>;
}
