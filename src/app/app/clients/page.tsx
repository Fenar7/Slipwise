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

async function ClientsWorkspaceLoader({ searchParams }: ClientsPageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1", 10));
  const filter = (params.filter || "all") as ClientFilter;
  const search = params.search || undefined;
  const sort = parseSort(params.sort);

  const { customers, total, totalPages } = await listCustomers({
    search,
    filter,
    page,
    limit: 20,
  });

  let sortedCustomers = customers;
  if (sort) {
    sortedCustomers = [...customers].sort((a, b) => {
      let cmp = 0;
      if (sort.key === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sort.key === "outstandingBalance") {
        cmp = a.outstandingBalance - b.outstandingBalance;
      } else if (sort.key === "lastActivityAt") {
        const aTime = new Date(a.lastActivityAt).getTime();
        const bTime = new Date(b.lastActivityAt).getTime();
        cmp = aTime - bTime;
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }

  return (
    <ClientWorkspaceShell
      clients={sortedCustomers}
      total={total}
      page={page}
      totalPages={totalPages}
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
