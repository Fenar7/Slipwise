"use client";

import type { ApiConversationDetail } from "./mappers";

/**
 * Determine whether the current user has a governance-capable role
 * (OWNER or ADMIN) in the given conversation detail.
 */
export function canGovern(detail: ApiConversationDetail | null | undefined): boolean {
  if (!detail) return false;
  const myParticipant = detail.participants.find(
    (p) => p.userId === detail.currentUserId && p.isActive,
  );
  if (!myParticipant) return false;
  return myParticipant.role === "OWNER" || myParticipant.role === "ADMIN";
}

/**
 * Determine whether the current user is the owner of the conversation.
 */
export function isOwner(detail: ApiConversationDetail | null | undefined): boolean {
  if (!detail) return false;
  const myParticipant = detail.participants.find(
    (p) => p.userId === detail.currentUserId && p.isActive,
  );
  return myParticipant?.role === "OWNER";
}
