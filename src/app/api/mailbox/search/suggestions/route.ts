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

  const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.search);
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
 * Quoted identifiers for PostgreSQL reserved words.
 */
async function searchContactSuggestions(
  orgId: string,
  query: string,
  limit: number,
): Promise<SearchSuggestion[]> {
  if (limit <= 0) return [];

  const pattern = `%${query}%`;

  // Use Prisma's typed query to avoid raw SQL reserved-word issues
  const rows = await db.mailboxMessage.findMany({
    where: {
      orgId,
      thread: { orgId },
      OR: [
        { from: { path: ["email"], string_contains: query, mode: "insensitive" } },
        { from: { path: ["displayName"], string_contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      from: true,
    },
    take: 20,
    orderBy: { sentAt: "desc" },
  });

  // Deduplicate by email
  const seen = new Map<string, { email: string; displayName: string | null; count: number }>();
  for (const row of rows) {
    const sender = row.from as { email: string; displayName: string | null } | null;
    if (!sender?.email) continue;
    const existing = seen.get(sender.email);
    if (existing) {
      existing.count++;
    } else {
      seen.set(sender.email, {
        email: sender.email,
        displayName: sender.displayName ?? null,
        count: 1,
      });
    }
  }

  return [...seen.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((s) => ({
      id: `contact:${s.email}`,
      text: `from:${s.email}`,
      label: s.displayName ? `${s.displayName} <${s.email}>` : s.email,
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
    await redis.lpush(key, trimmed);
    await redis.ltrim(key, 0, SEARCH_HISTORY_MAX - 1);
  } catch {
    // Redis unavailable — silently fail
  }
}
