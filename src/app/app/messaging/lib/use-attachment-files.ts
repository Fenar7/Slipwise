"use client";
import { useState, useCallback, useRef } from "react";

export interface AttachmentFileSummary {
  id: string;
  storageRef: string;
  name: string;
  mimeType: string;
  mimeCategory: "document" | "image" | "spreadsheet" | "other";
  sizeLabel: string;
  sizeBytes: number;
  thumbnailRef: string | null;
  scanStatus: string;
  uploadedAt: string;
  messageId: string;
}

export function useAttachmentFiles() {
  const [files, setFiles] = useState<AttachmentFileSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardRef = useRef<string | null>(null);

  const fetchFiles = useCallback(async (
    conversationId: string,
    options?: { category?: string; sort?: string },
  ) => {
    const guardKey = `files::${conversationId}::${Date.now()}`;
    guardRef.current = guardKey;
    setLoading(true);
    setError(null);
    try {
      const base = typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "";
      const url = new URL(`/api/messaging/conversations/${conversationId}/files`, base);
      if (options?.category && options.category !== "all") {
        url.searchParams.set("category", options.category);
      }
      if (options?.sort) {
        url.searchParams.set("sort", options.sort);
      }

      const res = await fetch(url.toString(), { credentials: "same-origin" });
      const payload = await res.json();
      if (guardRef.current !== guardKey) return;
      if (!res.ok || !payload.success) {
        setError(payload.error?.message ?? "Failed to load files");
        return;
      }
      setFiles(payload.data.files ?? []);
    } catch (err) {
      if (guardRef.current !== guardKey) return;
      setError("Network error loading files");
    } finally {
      if (guardRef.current === guardKey) setLoading(false);
    }
  }, []);

  const fetchDownloadUrl = useCallback(async (
    attachmentId: string,
  ): Promise<{ signedUrl: string; fileName: string; mimeType: string } | null> => {
    try {
      const res = await fetch(`/api/messaging/attachments/${attachmentId}/download`, {
        credentials: "same-origin",
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        return null;
      }
      return payload.data;
    } catch {
      return null;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { files, loading, error, fetchFiles, fetchDownloadUrl, clearError };
}
