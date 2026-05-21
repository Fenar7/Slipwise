"use client";

import { useState, useEffect, useCallback } from "react";

export interface OrgMember {
  id: string;
  name: string;
  avatarInitials: string;
  orgRole: string;
}

export function useOrgMembers() {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/messaging/org-members?q=${encodeURIComponent(query)}`, {
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error?.message ?? "Failed to load members");
        setMembers([]);
        return;
      }
      setMembers(data.data?.members ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    search("");
  }, [search]);

  return { members, loading, error, search };
}
