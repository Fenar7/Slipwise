import "server-only";

/**
 * Structured representation of a parsed mailbox search query.
 * Splits raw input like `from:test@example.com is:unread invoice` into
 * discrete operator tokens and free-text segments.
 */
export interface ParsedSearchQuery {
  /** Free-text search terms (everything not matched by an operator). */
  text: string;
  /** `from:` operator value. */
  from: string | null;
  /** `to:` operator value (matches to/cc/bcc). */
  to: string | null;
  /** `subject:` operator value. */
  subject: string | null;
  /** `is:` operator values (e.g. unread, starred, read). */
  is: string[];
  /** `has:` operator values (e.g. attachment). */
  has: string[];
  /** `in:` operator value (folder hint). */
  in: string | null;
  /** `after:` operator value (ISO date string). */
  after: string | null;
  /** `before:` operator value (ISO date string). */
  before: string | null;
  /** All recognized operator tokens in original order. */
  tokens: SearchToken[];
  /** The original raw query string. */
  raw: string;
}

export interface SearchToken {
  /** Operator key (e.g. "from", "is", "has"). */
  operator: string;
  /** Operator value (e.g. "user@test.com", "unread"). */
  value: string;
  /** Start index in the raw string. */
  start: number;
  /** End index in the raw string. */
  end: number;
}

const OPERATOR_PATTERN = /\b(from|to|subject|is|has|in|after|before):(\S+)/gi;

/**
 * Parse a raw search query string into structured search terms.
 *
 * Supports Gmail-style operators:
 * - `from:email` — search sender
 * - `to:email` — search recipients (to/cc/bcc)
 * - `subject:text` — search subject
 * - `is:unread` / `is:read` / `is:starred` — status filters
 * - `has:attachment` — attachment filter
 * - `in:inbox` / `in:sent` — folder scoping
 * - `after:2024-01-01` / `before:2024-12-31` — date range
 *
 * Everything not matched by an operator is collected as free-text search.
 */
export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const result: ParsedSearchQuery = {
    text: "",
    from: null,
    to: null,
    subject: null,
    is: [],
    has: [],
    in: null,
    after: null,
    before: null,
    tokens: [],
    raw,
  };

  if (!raw.trim()) return result;

  let remaining = raw;
  let match: RegExpExecArray | null;

  // Reset regex state
  OPERATOR_PATTERN.lastIndex = 0;

  while ((match = OPERATOR_PATTERN.exec(raw)) !== null) {
    const operator = match[1].toLowerCase();
    const value = match[2];
    const start = match.index;
    const end = start + match[0].length;

    result.tokens.push({ operator, value, start, end });

    switch (operator) {
      case "from":
        result.from = value;
        break;
      case "to":
        result.to = value;
        break;
      case "subject":
        result.subject = value;
        break;
      case "is":
        result.is.push(value.toLowerCase());
        break;
      case "has":
        result.has.push(value.toLowerCase());
        break;
      case "in":
        result.in = value.toLowerCase();
        break;
      case "after":
        result.after = value;
        break;
      case "before":
        result.before = value;
        break;
    }
  }

  // Extract free-text by removing all operator tokens from the raw string
  let textParts = raw;
  // Remove tokens in reverse order to preserve indices
  const sortedTokens = [...result.tokens].sort((a, b) => b.start - a.start);
  for (const token of sortedTokens) {
    textParts = textParts.slice(0, token.start) + textParts.slice(token.end);
  }

  result.text = textParts.replace(/\s+/g, " ").trim();

  return result;
}

/**
 * Known Gmail search operators for suggestion generation.
 * Used by the suggestions endpoint to offer completions.
 */
export const GMAIL_SEARCH_OPERATORS = [
  { operator: "from", description: "sender email address", example: "from:user@example.com" },
  { operator: "to", description: "recipient email address", example: "to:user@example.com" },
  { operator: "subject", description: "subject line text", example: "subject:invoice" },
  { operator: "is", description: "message status", example: "is:unread" },
  { operator: "has", description: "has content type", example: "has:attachment" },
  { operator: "in", description: "folder name", example: "in:inbox" },
  { operator: "after", description: "after date (YYYY/MM/DD)", example: "after:2024/01/01" },
  { operator: "before", description: "before date (YYYY/MM/DD)", example: "before:2024/12/31" },
] as const;

export const GMAIL_SEARCH_FILTERS = [
  { value: "is:unread", label: "Unread messages", category: "status" },
  { value: "is:read", label: "Read messages", category: "status" },
  { value: "is:starred", label: "Starred messages", category: "status" },
  { value: "is:important", label: "Important messages", category: "status" },
  { value: "has:attachment", label: "Has attachment", category: "content" },
  { value: "in:inbox", label: "In Inbox", category: "folder" },
  { value: "in:sent", label: "In Sent", category: "folder" },
  { value: "in:draft", label: "In Drafts", category: "folder" },
  { value: "in:spam", label: "In Spam", category: "folder" },
  { value: "in:trash", label: "In Trash", category: "folder" },
  { value: "in:starred", label: "In Starred", category: "folder" },
] as const;

/**
 * Get the operator being typed at the cursor position.
 * Returns the operator prefix and partial value for autocomplete.
 */
export function getActiveOperator(
  query: string,
  cursorPos: number,
): { operator: string; partialValue: string; startIndex: number } | null {
  // Find the last operator token before the cursor
  const textBeforeCursor = query.slice(0, cursorPos);

  // Match the last operator:word pair before cursor
  const match = textBeforeCursor.match(/\b(from|to|subject|is|has|in|after|before):(\S*)$/i);
  if (!match) return null;

  return {
    operator: match[1].toLowerCase(),
    partialValue: match[2],
    startIndex: match.index!,
  };
}
