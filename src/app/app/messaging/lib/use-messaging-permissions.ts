"use client";

import { useState, useEffect } from "react";
import { getMessagingPermissions, type MessagingPermissions } from "../permissions-actions";

/**
 * Hook to fetch and cache the current user's messaging permissions.
 * Sprint 11.3: UI permission gating.
 */
export function useMessagingPermissions(): MessagingPermissions & { loading: boolean } {
  const [permissions, setPermissions] = useState<MessagingPermissions>({
    canAccessWorkspace: false,
    canRead: false,
    canSend: false,
    canManage: false,
    canGovern: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getMessagingPermissions()
      .then((perms) => {
        if (!cancelled) {
          setPermissions(perms);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPermissions({
            canAccessWorkspace: false,
            canRead: false,
            canSend: false,
            canManage: false,
            canGovern: false,
          });
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { ...permissions, loading };
}
