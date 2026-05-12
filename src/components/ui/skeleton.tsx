import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-[var(--surface-subtle)]",
        className
      )}
    />
  );
}

interface SkeletonCardProps {
  rows?: number;
  className?: string;
}

export function SkeletonCard({ rows = 3, className }: SkeletonCardProps) {
  return (
    <div className={cn("slipwise-panel p-5 space-y-3", className)}>
      <Skeleton className="h-5 w-1/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

interface SkeletonTableProps {
  columns?: number;
  rows?: number;
  className?: string;
}

export function SkeletonTable({ columns = 4, rows = 5, className }: SkeletonTableProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex gap-2">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-8 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-2">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={`${r}-${c}`} className="h-10 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
