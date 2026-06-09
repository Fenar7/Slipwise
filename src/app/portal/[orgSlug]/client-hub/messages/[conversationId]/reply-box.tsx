"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitPortalConversationReply } from "../actions";
import { Send, Loader2 } from "lucide-react";

interface PortalMessageReplyBoxProps {
  conversationId: string;
  orgSlug: string;
}

export function PortalMessageReplyBox({
  conversationId,
  orgSlug,
}: PortalMessageReplyBoxProps) {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await submitPortalConversationReply(orgSlug, conversationId, trimmed);

      if (result.success) {
        setMessage("");
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError("Failed to send message. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message here..."
          className="w-full min-h-[80px] max-h-[200px] resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
          disabled={isSubmitting}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />

        {error && (
          <p className="text-xs font-medium text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Press Enter to send, Shift + Enter for new line.
          </span>

          <button
            type="submit"
            disabled={!message.trim() || isSubmitting}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span>Send</span>
          </button>
        </div>
      </form>
    </div>
  );
}
