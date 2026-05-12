type PreviewFrameProps = {
  title: string;
  summary: string;
};

export function PreviewFrame({ title, summary }: PreviewFrameProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--border-strong)] bg-white p-5">
      <div className="relative rounded-lg border border-[var(--border-soft)] bg-white p-6">
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] pb-4">
          <div>
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.34em] text-[var(--muted-foreground)]">
              A4 Preview Surface
            </p>
            <h3 className="mt-2 text-[1.35rem] leading-tight tracking-[-0.04em] text-[var(--foreground)]">
              {title}
            </h3>
          </div>
          <span className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-accent)] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
            Slipwise canvas
          </span>
        </div>

        <div className="grid gap-6 py-6 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-soft)] px-5 py-5">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <div className="h-3 w-20 rounded-full bg-[var(--ink-soft)]/18" />
                  <div className="mt-3 h-5 w-52 rounded-full bg-[var(--ink-soft)]/30" />
                </div>
                <div className="h-10 w-10 rounded-lg border border-[var(--border-soft)] bg-white" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="rounded-md border border-[var(--border-soft)] bg-white px-3 py-3"
                  >
                    <div className="h-2.5 w-16 rounded-full bg-[var(--ink-soft)]/18" />
                    <div className="mt-3 h-3 w-28 rounded-full bg-[var(--ink-soft)]/30" />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-[var(--border-soft)] bg-white px-5 py-5">
              <div className="flex items-center justify-between">
                <div className="h-3 w-28 rounded-full bg-[var(--ink-soft)]/18" />
                <div className="h-3 w-20 rounded-full bg-[var(--accent)]/30" />
              </div>
              <div className="mt-5 space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-md bg-[var(--surface-soft)] px-3 py-3"
                  >
                    <div className="h-2.5 w-24 rounded-full bg-[var(--ink-soft)]/18" />
                    <div className="h-2.5 w-12 rounded-full bg-[var(--ink-soft)]/30" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4">
            <div className="h-3 w-20 rounded-full bg-[var(--ink-soft)]/18" />
            <p className="mt-4 text-sm leading-7 text-[var(--muted-foreground)]">
              {summary}
            </p>
            <div className="mt-6 space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-md border border-[var(--border-soft)] bg-white px-3 py-3"
                >
                  <div className="h-2.5 w-14 rounded-full bg-[var(--ink-soft)]/18" />
                  <div className="mt-3 h-3 w-full rounded-full bg-[var(--ink-soft)]/18" />
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
