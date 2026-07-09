"use client";

import { cn } from "@/lib/utils";

interface StaleDataBannerProps {
  visible: boolean;
  label: string;
  onRefresh: () => void;
  onReapplyAll?: () => void;
  className?: string;
}

export function StaleDataBanner({ visible, label, onRefresh, onReapplyAll, className }: StaleDataBannerProps) {
  if (!visible) return null;

  return (
    <div className={cn("flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm", className)} role="alert">
      <svg className="h-4 w-4 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="flex-1 text-amber-800">{label}</span>
      <button type="button" onClick={onRefresh} className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors">
        Refresh defaults
      </button>
      {onReapplyAll && (
        <button type="button" onClick={onReapplyAll} className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors">
          Reapply all
        </button>
      )}
    </div>
  );
}
