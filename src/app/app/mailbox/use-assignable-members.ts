"use client";

import { useState, useEffect, useCallback } from "react";
import { getMailboxAssignableMembers } from "./actions";
import type { AssignableMember } from "./actions";

export interface UseAssignableMembersResult {
  members: AssignableMember[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAssignableMembers(): UseAssignableMembersResult {
  const [members, setMembers] = useState<AssignableMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getMailboxAssignableMembers();
      setMembers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  return {
    members,
    isLoading,
    error,
    refetch: fetchMembers,
  };
}
