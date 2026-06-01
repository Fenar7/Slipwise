import { AlertCircle, Lock, Hammer } from "lucide-react";

type PortalErrorStateProps = {
  type: "NOT_FOUND" | "DISABLED" | "NOT_READY";
  orgName?: string;
};

export function PortalErrorState({ type, orgName }: PortalErrorStateProps) {
  const content = {
    NOT_FOUND: {
      icon: <AlertCircle className="h-6 w-6 text-red-500" />,
      title: "Page Not Found",
      description: "The page you are looking for does not exist or has been moved.",
      badge: "404 Error",
      badgeClass: "bg-red-50 text-red-700 ring-red-600/10",
    },
    DISABLED: {
      icon: <Lock className="h-6 w-6 text-amber-500" />,
      title: "Portal Access Disabled",
      description: `The customer portal for ${orgName || "this organization"} is currently disabled by the administrator.`,
      badge: "Restricted",
      badgeClass: "bg-amber-50 text-amber-700 ring-amber-600/10",
    },
    NOT_READY: {
      icon: <Hammer className="h-6 w-6 text-blue-500" />,
      title: "Portal Under Configuration",
      description: `The client portal for ${orgName || "this organization"} is enabled but still being configured by the team. Please check back shortly.`,
      badge: "Setup in Progress",
      badgeClass: "bg-blue-50 text-blue-700 ring-blue-600/10",
    },
  }[type];

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8 font-sans">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-[0px_1px_3px_rgba(15,23,42,0.03),0px_1px_2px_rgba(15,23,42,0.06)]">
          {content.icon}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-center">
            <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${content.badgeClass}`}>
              {content.badge}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {content.title}
          </h1>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-slate-500">
            {content.description}
          </p>
        </div>
        <div className="pt-4 border-t border-slate-200">
          <p className="text-xs text-slate-400">
            Powered by{" "}
            <a href="https://slipwise.in" target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-600 hover:text-slate-900 transition-colors">
              Slipwise
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
