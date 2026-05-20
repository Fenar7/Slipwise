import { Suspense } from "react";
import { listCustomers } from "../data/actions";
import type { ClientFilter } from "./components/client-workspace-mock-data";
import { ClientWorkspaceShell } from "./components/client-workspace-shell";

export const metadata = {
  title: "Clients | Slipwise",
};

interface ClientsPageProps {
  searchParams: Promise<{
    search?: string;
    filter?: string;
    page?: string;
    sort?: string;
  }>;
}

function parseSort(sort?: string): { key: "name" | "outstandingBalance" | "lastActivityAt"; dir: "asc" | "desc" } | undefined {
  if (!sort) return undefined;
  const [key, dir] = sort.split(":");
  if (!["name", "outstandingBalance", "lastActivityAt"].includes(key)) return undefined;
  return { key: key as "name" | "outstandingBalance" | "lastActivityAt", dir: dir === "asc" ? "asc" : "desc" };
}

function safePage(raw?: string): number {
  const n = parseInt(raw || "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

async function ClientsWorkspaceLoader({ searchParams }: ClientsPageProps) {
  const params = await searchParams;
  const page = safePage(params.page);
  const filter = (params.filter || "all") as ClientFilter;
  const search = params.search || undefined;
  const sort = parseSort(params.sort);

  const { customers, total, totalPages } = await listCustomers({
    search,
    filter,
    page,
    limit: 20,
    sort,
  });

  const { total: unfilteredTotal } = await listCustomers({ page: 1, limit: 1 });

  return (
    <ClientWorkspaceShell
      clients={customers}
      total={total}
      page={page}
      totalPages={totalPages}
      unfilteredTotal={unfilteredTotal}
      searchQuery={search || ""}
      activeFilter={filter}
      sort={sort}
    />
  );
}

export default function ClientsPage(props: ClientsPageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12 text-[var(--text-muted)]">
          <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-soft)] border-t-[var(--brand-primary)]" />
          Loading clients…
        </div>
      }
    >
      <ClientsWorkspaceLoader searchParams={props.searchParams} />
    </Suspense>
  );
}
