import type { NavItem } from "./suite-nav-items";
import { suiteNavItems } from "./suite-nav-items";

export interface BreadcrumbItem {
  href?: string;
  label: string;
}

export interface NavigationContext {
  breadcrumbs: BreadcrumbItem[];
  pageTitle: string;
  suiteLabel: string;
  switcherItems: Array<NavItem & { isActive: boolean }>;
}

const KNOWN_SEGMENT_LABELS = new Map<string, string>([
  ["ai", "AI"],
  ["api", "API"],
  ["crm", "CRM"],
  ["csv", "CSV"],
  ["einvoice", "E-Invoice"],
  ["grn", "GRN"],
  ["gst", "GST"],
  ["hsn-sac", "HSN / SAC"],
  ["irn", "IRN"],
  ["ocr", "OCR"],
  ["oauth", "OAuth"],
  ["pdf", "PDF"],
  ["sso", "SSO"],
  ["tds", "TDS"],
  ["totp", "TOTP"],
  ["va", "VA"],
]);

const pathLabelMap = new Map<string, string>();

for (const item of suiteNavItems) {
  pathLabelMap.set(item.href, item.label);
  item.children?.forEach((child) => pathLabelMap.set(child.href, child.label));
}

function isIdentifierSegment(segment: string) {
  return /^\d+$/.test(segment) || /^[a-z0-9-]{16,}$/i.test(segment);
}

function titleizeSegment(segment: string) {
  if (segment === "new") return "New";
  if (segment === "edit") return "Edit";
  if (segment === "home") return "Home";
  if (segment === "app") return "Slipwise";
  if (isIdentifierSegment(segment)) return "Details";

  return segment
    .split("-")
    .map((part) => KNOWN_SEGMENT_LABELS.get(part) ?? `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function matchHref(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getNavigationContext(pathname: string): NavigationContext {
  const cleanPath = pathname.split("?")[0];
  const segments = cleanPath.split("/").filter(Boolean);
  const suiteItem =
    suiteNavItems.find((item) => matchHref(cleanPath, item.href) || cleanPath.startsWith(`/app/${item.suite}`)) ??
    suiteNavItems[0];

  const breadcrumbs: BreadcrumbItem[] = [{ href: "/app/home", label: "Slipwise" }];

  if (cleanPath === "/app/home") {
    return {
      breadcrumbs,
      pageTitle: "Home",
      suiteLabel: "Home",
      switcherItems: suiteNavItems.map((item) => ({
        ...item,
        isActive: matchHref(cleanPath, item.href) || cleanPath.startsWith(`/app/${item.suite}`),
      })),
    };
  }

  const suiteHref = suiteItem?.href ?? (segments[1] ? `/app/${segments[1]}` : "/app/home");
  const suiteLabel = suiteItem?.label ?? titleizeSegment(segments[1] ?? "home");
  breadcrumbs.push({ href: suiteHref, label: suiteLabel });

  let currentPath = "/app";
  for (let index = 1; index < segments.length; index += 1) {
    currentPath += `/${segments[index]}`;
    if (currentPath === suiteHref || currentPath === "/app/home") continue;

    const label = pathLabelMap.get(currentPath) ?? titleizeSegment(segments[index]);
    if (breadcrumbs[breadcrumbs.length - 1]?.label === label) continue;

    const isLast = index === segments.length - 1;
    breadcrumbs.push({ href: isLast ? undefined : currentPath, label });
  }

  return {
    breadcrumbs,
    pageTitle: breadcrumbs[breadcrumbs.length - 1]?.label ?? suiteLabel,
    suiteLabel,
    switcherItems: suiteNavItems.map((item) => ({
      ...item,
      isActive: matchHref(cleanPath, item.href) || cleanPath.startsWith(`/app/${item.suite}`),
    })),
  };
}
