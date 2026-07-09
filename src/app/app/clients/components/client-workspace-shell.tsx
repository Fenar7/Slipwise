import { ClientWorkspaceHeader } from "./client-workspace-header";
import { ClientWorkspaceTable } from "./client-workspace-table";
import { ClientWorkspaceEmpty } from "./client-workspace-empty";
import type { ClientFilter, ClientWorkspaceRow } from "./client-workspace-mock-data";

interface ClientWorkspaceShellProps {
  clients: ClientWorkspaceRow[];
  total: number;
  page: number;
  totalPages: number;
  unfilteredTotal: number;
  searchQuery: string;
  activeFilter: ClientFilter;
  sort?: { key: "name" | "outstandingBalance" | "lastActivityAt"; dir: "asc" | "desc" } | undefined;
}

export function ClientWorkspaceShell({
  clients,
  total,
  page,
  totalPages,
  unfilteredTotal,
  searchQuery,
  activeFilter,
  sort,
}: ClientWorkspaceShellProps) {
  const hasAnyClientsEver = unfilteredTotal > 0;
  const hasMatches = total > 0;

  return (
    <div className="space-y-5">
      <ClientWorkspaceHeader
        searchQuery={searchQuery}
        activeFilter={activeFilter}
        resultCount={total}
      />

      {!hasAnyClientsEver ? (
        <ClientWorkspaceEmpty />
      ) : !hasMatches ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border-default)] bg-white px-4 py-16 text-center">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            No clients match your search
          </h3>
          <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">
            Try adjusting your filters or search terms to find what you are looking for.
          </p>
        </div>
      ) : (
        <ClientWorkspaceTable
          clients={clients}
          total={total}
          page={page}
          totalPages={totalPages}
          searchQuery={searchQuery}
          activeFilter={activeFilter}
          sort={sort}
        />
      )}
    </div>
  );
}
