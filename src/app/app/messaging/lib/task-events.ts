"use client";

import { useEffect } from "react";

const TASK_MUTATION_EVENT = "messaging-task-mutation";
const BROADCAST_CHANNEL_NAME = "messaging-task-channel";

/**
 * Dispatch an event to all mounted task views to trigger a refresh.
 * Uses CustomEvent for local-tab freshness and BroadcastChannel for cross-tab freshness.
 */
export function dispatchTaskMutation() {
  if (typeof window !== "undefined") {
    // Local tab
    window.dispatchEvent(new CustomEvent(TASK_MUTATION_EVENT));
    // Cross-tab
    try {
      const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      bc.postMessage({ type: "invalidate" });
      bc.close();
    } catch (err) {} // ignore if not supported
  }
}

/**
 * Hook to listen for task mutations and external context switches to trigger a refresh.
 * Integrates local events, cross-tab events, and focus/visibility changes for strict freshness.
 */
export function useTaskInvalidation(onInvalidate: () => void) {
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      bc.onmessage = (event) => {
        if (event.data?.type === "invalidate") onInvalidate();
      };
    } catch (err) {}

    const handleLocal = () => onInvalidate();
    
    // Revalidate on focus/visibility
    const handleFocus = () => onInvalidate();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") onInvalidate();
    };

    window.addEventListener(TASK_MUTATION_EVENT, handleLocal);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener(TASK_MUTATION_EVENT, handleLocal);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (bc) bc.close();
    };
  }, [onInvalidate]);
}
