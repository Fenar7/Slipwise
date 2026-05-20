"use client";
import { useState, useCallback, useRef } from "react";

export interface UploadedAttachment {
  storageRef: string;
  uploadToken: string;
  fileName: string;
  mimeType: string;
  mimeCategory: string;
  sizeBytes: number;
}

export interface UploadFailure {
  fileName: string;
  reason: "invalid_type" | "blocked_extension" | "empty_file" | "too_large" | "upload_failed" | "network_error";
  message: string;
}

export interface UploadState {
  uploading: boolean;
  stagedFiles: UploadedAttachment[];
  failures: UploadFailure[];
  error: string | null;
}

export function useAttachmentUpload() {
  const [state, setState] = useState<UploadState>({
    uploading: false,
    stagedFiles: [],
    failures: [],
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const upload = useCallback(async (file: File): Promise<UploadedAttachment | null> => {
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({ ...prev, uploading: true, error: null }));

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/messaging/attachments/upload", {
        method: "POST",
        credentials: "same-origin",
        body: formData,
        signal: controller.signal,
      });

      const payload = await res.json();

      if (!res.ok || !payload.success) {
        const code = payload.error?.code ?? "upload_failed";
        const reasonMap: Record<string, UploadFailure["reason"]> = {
          VALIDATION_ERROR: file.size > 50 * 1024 * 1024 ? "too_large" : file.size <= 0 ? "empty_file" : "invalid_type",
        };
        const reason = reasonMap[code] ?? "upload_failed";
        setState((prev) => ({
          ...prev,
          uploading: false,
          failures: [
            ...prev.failures,
            { fileName: file.name, reason, message: payload.error?.message ?? "Upload failed" },
          ],
        }));
        return null;
      }

      const uploaded: UploadedAttachment = payload.data;
      setState((prev) => ({
        ...prev,
        uploading: false,
        stagedFiles: [...prev.stagedFiles, uploaded],
      }));
      return uploaded;
    } catch (err) {
      if (controller.signal.aborted) return null;
      const reason: UploadFailure["reason"] = err instanceof TypeError ? "network_error" : "upload_failed";
      setState((prev) => ({
        ...prev,
        uploading: false,
        error: reason === "network_error" ? "Network error during upload. Please try again." : "Upload failed. Please try again.",
      }));
      return null;
    }
  }, []);

  const removeStaged = useCallback((storageRef: string) => {
    setState((prev) => ({
      ...prev,
      stagedFiles: prev.stagedFiles.filter((f) => f.storageRef !== storageRef),
    }));
  }, []);

  const clearFailures = useCallback(() => {
    setState((prev) => ({ ...prev, failures: [] }));
  }, []);

  const clearAll = useCallback(() => {
    setState({ uploading: false, stagedFiles: [], failures: [], error: null });
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    upload,
    removeStaged,
    clearFailures,
    clearAll,
    clearError,
  };
}
