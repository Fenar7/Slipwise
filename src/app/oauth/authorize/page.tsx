"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  getAuthorizationRequest,
  approveAuthorization,
  denyAuthorization,
} from "./actions";

interface ScopeInfo {
  key: string;
  label: string;
}

interface AppInfo {
  appName: string;
  appDescription: string | null;
  scopes: ScopeInfo[];
  clientId: string;
  redirectUri: string;
  state: string;
}

function OAuthAuthorizeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const clientId = searchParams.get("client_id") ?? "";
  const redirectUri = searchParams.get("redirect_uri") ?? "";
  const scope = searchParams.get("scope") ?? "";
  const state = searchParams.get("state") ?? "";

  useEffect(() => {
    async function load() {
      if (!clientId || !redirectUri || !scope) {
        setError("Missing required parameters.");
        setLoading(false);
        return;
      }

      const result = await getAuthorizationRequest(clientId, redirectUri, scope, state);
      if (result.success) {
        setAppInfo(result.data);
      } else {
        setError(result.error);
      }
      setLoading(false);
    }
    load();
  }, [clientId, redirectUri, scope, state]);

  async function handleAuthorize() {
    if (!appInfo) return;
    setSubmitting(true);
    const result = await approveAuthorization(
      appInfo.clientId,
      appInfo.redirectUri,
      scope,
      appInfo.state,
    );
    if (result.success) {
      router.push(result.data.redirectUrl);
    } else {
      setError(result.error);
      setSubmitting(false);
    }
  }

  async function handleDeny() {
    setSubmitting(true);
    const result = await denyAuthorization(redirectUri, state);
    if (result.success) {
      router.push(result.data.redirectUrl);
    } else {
      setError(result.error);
      setSubmitting(false);
    }
  }


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center space-y-4">
          <div className="text-red-600 text-lg font-semibold">Authorization Error</div>
          <p className="text-slate-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!appInfo) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold text-slate-900">Authorize {appInfo.appName}</h1>
          {appInfo.appDescription && (
            <p className="text-sm text-slate-500 mt-2">{appInfo.appDescription}</p>
          )}
        </div>

        <div className="border border-slate-200 rounded-lg p-4">
          <h2 className="text-sm font-medium text-slate-700 mb-3">
            This application is requesting access to:
          </h2>
          <ul className="space-y-2">
            {appInfo.scopes.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-sm text-slate-600">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0" />
                {s.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500">
          By authorizing, you allow this app to access your organization&apos;s data
          within the specified scopes.
        </div>

        <div className="flex gap-3">
          <Button
            className="flex-1"
            onClick={handleAuthorize}
            disabled={submitting}
          >
            {submitting ? "Authorizing…" : "Authorize"}
          </Button>
          <Button
            className="flex-1"
            onClick={handleDeny}
            disabled={submitting}
          >
            Deny
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function OAuthAuthorizePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-slate-500">Loading…</div>
        </div>
      }
    >
      <OAuthAuthorizeContent />
    </Suspense>
  );
}