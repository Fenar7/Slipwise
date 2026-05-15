"use client";

import { useState } from "react";
import { ClientWorkspaceHeader } from "./client-workspace-header";
import { ClientWorkspaceTable } from "./client-workspace-table";
import { ClientWorkspaceEmpty } from "./client-workspace-empty";
import { MOCK_CLIENTS } from "./client-workspace-mock-data";
import type { ClientFilter } from "./client-workspace-mock-data";

export function ClientWorkspaceShell() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<ClientFilter>("all");

  // In Phase 1 this uses static mock data. Later sprints will wire real queries.
  const clients = MOCK_CLIENTS;

  return (
    <div className="space-y-5">
      <ClientWorkspaceHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        resultCount={clients.length}
      />

      {clients.length === 0 ? (
        <ClientWorkspaceEmpty />
      ) : (
        <ClientWorkspaceTable
          clients={clients}
          searchQuery={searchQuery}
          activeFilter={activeFilter}
          pageSize={10}
        />
      )}
    </div>
  );
}
