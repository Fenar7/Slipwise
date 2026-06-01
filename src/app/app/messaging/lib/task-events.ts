"use client";

import { useEffect } from "react";

const TASK_MUTATION_EVENT = "messaging-task-mutation";

/**
 * Dispatch an event to all mounted task views to trigger a refresh.
 * Use this after any successful task mutation (create, update, status change, assign).
 */
export function dispatchTaskMutation() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(TASK_MUTATION_EVENT));
  }
}

/**
 * Hook to listen for task mutations and trigger a refresh.
 * @param onInvalidate Callback to run when a task is mutated.
 */
export function useTaskInvalidation(onInvalidate: () => void) {
  useEffect(() => {
    const handleMutation = () => onInvalidate();
    window.addEventListener(TASK_MUTATION_EVENT, handleMutation);
    return () => window.removeEventListener(TASK_MUTATION_EVENT, handleMutation);
  }, [onInvalidate]);
}
