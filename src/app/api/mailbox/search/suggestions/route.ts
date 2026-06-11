import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis-client";
import { GMAIL_SEARCH_FILTERS, getActiveOperator } from "@/lib/mailbox/search-query-parser";

const MAX_SUGGESTIONS = 8;
const SEARCH_HISTORY_KEY_PREFIX = "mailbox:history";
const SEARCH_HISTORY_MAX = 20;

interface SearchSuggestion {
  id: string;
  text: string;
  label: string;
  category: "operator" | "filter" | "contact" | "history";
}

/**
 * GET /api/mailbox/search/suggestions?q=<query>&cursor=<pos>
 *
 * Returns search suggestions based on the current query input.
 * Suggestions include:
 * - Static Gmail search operators and filters
 * - Frequent contacts from local MailboxMessage table
 * - Recent search history from Redis
 */
export async function GET(request: NextRequest) {
  const auth = await requireIntegrationMemberRoute();
  if (!auth.ok) return auth.response;

  const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.SEARCH);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: rl.headers },
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const cursorPos = parseInt(searchParams.get("cursor") ?? String(query.length), 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "8", 10), MAX_SUGGESTIONS);

  const suggestions: SearchSuggestion[] = [];

  // 1. If typing an operator, suggest completions
  const activeOp = getActiveOperator(query, cursorPos);
  if (activeOp && activeOp.partialValue.length < 3) {
    // Suggest matching filter values
    const matchingFilters = GMAIL_SEARCH_FILTERS.filter((f) =>
      f.value.toLowerCase().startsWith(`${activeOp.operator}:${activeOp.partialValue}`) &&
      f.value.toLowerCase() !== `${activeOp.operator}:${activeOp.partialValue}`,
    ).slice(0, 4);

    for (const filter of matchingFilters) {
      suggestions.push({
        id: `filter:${filter.value}`,
        text: filter.value,
        label: filter.label,
        category: "filter",
      });
    }
  }

  // 2. If not typing an operator, suggest from all categories
  if (!activeOp || activeOp.partialValue.length >= 3) {
    const freeText = (activeOp ? query.replace(/\b\w+:\S*$/, "").trim() : query).trim();

    // 2a. Static filter suggestions (if query is short or empty)
    if (freeText.length <= 2) {
      const topFilters = GMAIL_SEARCH_FILTERS.slice(0, 4);
      for (const filter of topFilters) {
        if (!suggestions.some((s) => s.text === filter.value)) {
          suggestions.push({
            id: `filter:${filter.value}`,
            text: filter.value,
            label: filter.label,
            category: "filter",
          });
        }
      }
    }

    // 2b. Contact suggestions from local DB
    if (freeText.length >= 2) {
      try {
        const contactSuggestions = await searchContactSuggestions(
          auth.ctx.orgId,
          freeText,
          Math.max(1, limit - suggestions.length),
        );
        for (const contact of contactSuggestions) {
          if (!suggestions.some((s) => s.text === contact.text)) {
            suggestions.push(contact);
          }
        }
      } catch {
        // Silently fail — suggestions are non-critical
      }
    }

    // 2c. Search history from Redis
    try {
      const historySuggestions = await searchHistorySuggestions(
        auth.ctx.orgId,
        auth.ctx.userId,
        freeText,
        Math.max(1, limit - suggestions.length),
      );
      for (const history of historySuggestions) {
        if (!suggestions.some((s) => s.text === history.text)) {
          suggestions.push(history);
        }
      }
    } catch {
      // Silently fail — suggestions are non-critical
    }
  }

  return NextResponse.json({
    suggestions: suggestions.slice(0, limit),
  });
}

/**
 * Search local MailboxMessage table for matching contacts.
 * Uses ILIKE on sender email and display name.
 */
async function searchContactSuggestions(
  orgId: string,
  query: string,
  limit: number,
): Promise<SearchSuggestion[]> {
  if (limit <= 0) return [];

  const pattern = `%${query}%`;

  // Search distinct senders from messages the user's org has received
  const rows = await db.$queryRawUnsafe<
    Array<{ email: string; display_name: string | null; count: bigint }>
  >(
    `SELECT DISTINCT
       (m.from->>'email') AS email,
       (m.from->>'displayName') AS display_name,
       COUNT(*) OVER (PARTITION BY (m.from->>'email')) AS count
     FROM mailbox_message m
     JOIN mailbox_thread t ON t.id = m.thread_id
     WHERE t.org_id = $1
       AND (
         (m.from->>'email') ILIKE $2
         OR (m.from->>'displayName') ILIKE $2
       )
     ORDER BY count DESC
     LIMIT $3`,
    orgId,
    pattern,
    limit,
  );

  return rows.map((row) => ({
    id: `contact:${row.email}`,
    text: `from:${row.email}`,
    label: row.display_name ? `${row.display_name} <${row.email}>` : row.email,
    category: "contact" as const,
  }));
}

/**
 * Retrieve recent search queries from Redis.
 * Falls back to empty array if Redis is unavailable.
 */
async function searchHistorySuggestions(
  orgId: string,
  userId: string,
  prefix: string,
  limit: number,
): Promise<SearchSuggestion[]> {
  if (limit <= 0) return [];

  const key = `${SEARCH_HISTORY_KEY_PREFIX}:${orgId}:${userId}`;

  try {
    // Try Redis lrange first
    const history = await redis.lrange(key, 0, SEARCH_HISTORY_MAX - 1);
    if (!history || history.length === 0) return [];

    const matches = history.filter((item) =>
      prefix ? item.toLowerCase().includes(prefix.toLowerCase()) : true,
    );

    return matches.slice(0, limit).map((item) => ({
      id: `history:${item}`,
      text: item,
      label: item,
      category: "history" as const,
    }));
  } catch {
    // Redis unavailable — return empty
    return [];
  }
}

/**
 * Record a successful search query to Redis history.
 * Called by the search route after a successful search.
 */
export async function recordSearchHistory(
  orgId: string,
  userId: string,
  query: string,
): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return;

  const key = `${SEARCH_HISTORY_KEY_PREFIX}:${orgId}:${userId}`;

  try {
    // Add to front of list, trim to max size
    await redis.lpush(key, trimmed);
    await redis.ltrim(key, 0, SEARCH_HISTORY_MAX - 1);
  } catch {
    // Redis unavailable — silently fail
  }
}
