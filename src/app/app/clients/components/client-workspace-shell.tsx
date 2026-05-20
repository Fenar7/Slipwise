import { ClientWorkspaceHeader } from "./client-workspace-header";
import { ClientWorkspaceTable } from "./client-workspace-table";
import { ClientWorkspaceEmpty } from "./client-workspace-empty";
import type { ClientFilter, ClientWorkspaceRow } from "./client-workspace-mock-data";

interface ClientWorkspaceShellProps {
  clients: ClientWorkspaceRow[];
  total: number;
  page: number;
  totalPages: number;
  searchQuery: string;
  activeFilter: ClientFilter;
  sort?: { key: "name" | "outstandingBalance" | "lastActivityAt"; dir: "asc" | "desc" } | undefined;
}

export function ClientWorkspaceShell({
  clients,
  total,
  page,
  totalPages,
  searchQuery,
  activeFilter,
  sort,
}: ClientWorkspaceShellProps) {
  const hasAnyClients = total > 0;

  return (
    <div className="space-y-5">
      <ClientWorkspaceHeader
        searchQuery={searchQuery}
        activeFilter={activeFilter}
        resultCount={total}
      />

      {!hasAnyClients ? (
        <ClientWorkspaceEmpty />
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
