"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import { ClientDetailHeader } from "./client-detail-header";
import { ClientDetailSummary } from "./client-detail-summary";
import { ClientDetailTabs } from "./client-detail-tabs";
import { ClientDetailSections } from "./client-detail-sections";
import { ClientDetailRail } from "./client-detail-rail";
import { getMockClientDetail } from "./client-detail-mock-data";
import type { ClientDetail } from "@/app/app/data/actions";

type DetailTab = "overview" | "documents" | "contacts" | "billing" | "portal" | "activity";

interface ClientDetailShellProps {
  clientId: string;
  client?: ClientDetail;
}

export function ClientDetailShell({ clientId, client: initialClient }: ClientDetailShellProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");

  // Fallback to mock data for backward compatibility with legacy tests
  const client = initialClient ?? (getMockClientDetail(clientId) as any);

  if (!client) {
    notFound();
  }

  return (
    <div className="space-y-5">
      {/* Identity header + quick actions */}
      <ClientDetailHeader client={client} />

      {/* Summary band: financial, document, portal indicators */}
      <ClientDetailSummary client={client} />

      {/* Main content: tabs + sections */}
      <div className="flex flex-col gap-5 lg:flex-row">
        <main className="min-w-0 flex-1 space-y-4">
          <ClientDetailTabs activeTab={activeTab} onTabChange={setActiveTab} />
          <ClientDetailSections client={client} activeTab={activeTab} />
        </main>

        {/* Right rail */}
        <aside className="w-full shrink-0 space-y-4 lg:w-[var(--detail-rail-width,320px)]">
          <ClientDetailRail client={client} />
        </aside>
      </div>
    </div>
  );
}
