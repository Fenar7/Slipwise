"use server";

import { queryVault, getDocsSummary } from "@/lib/docs-vault";
import type { VaultQueryParams, VaultResult, DocsSummary } from "@/lib/docs-vault";

/**
 * Server action — query the Document Vault.
 * Org-scoped internally via requireOrgContext().
 */
export async function getVaultDocuments(
  params: VaultQueryParams
): Promise<{ success: true; data: VaultResult } | { success: false; error: string }> {
  try {
    const result = await queryVault(params);
    return { success: true, data: result };
  } catch (error) {
    console.error("getVaultDocuments error:", error);
    return { success: false, error: "Failed to load vault documents" };
  }
}

/**
 * Server action — get the SW Docs suite summary for the home page.
 */
export async function getDocsHomeSummary(): Promise<
  { success: true; data: DocsSummary } | { success: false; error: string }
> {
  try {
    const summary = await getDocsSummary();
    return { success: true, data: summary };
  } catch (error) {
    console.error("getDocsHomeSummary error:", error);
    return { success: false, error: "Failed to load docs summary" };
  }
}
