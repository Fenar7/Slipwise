/**
 * Sprint 4.2 — HTML sanitizer for mailbox message body content.
 *
 * Uses isomorphic-dompurify with a conservative allowlist.
 * - Strips scripts, event handlers, forms, and object/embed tags.
 * - Preserves basic formatting (headings, paragraphs, lists, links, tables, etc.).
 * - Does NOT attempt to parse or collapse quoted content.
 */

import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "a",
  "b",
  "br",
  "blockquote",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
  "u",
  "hr",
  "font",
];

const ALLOWED_ATTR = [
  "href",
  "title",
  "src",
  "alt",
  "width",
  "height",
  "style",
  "class",
  "target",
  "rel",
];

export function sanitizeMessageHtml(html: string): string {
  if (!html || typeof html !== "string") {
    return "";
  }

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_ATTR: ["onerror", "onload", "onmouseover", "onclick", "onmouseout"],
    FORBID_TAGS: ["script", "style", "form", "input", "button", "select", "textarea", "object", "embed", "iframe"],
    KEEP_CONTENT: true,
  });
}
