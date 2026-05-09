"use client";
import { useOrgBranding } from "@/hooks/use-org-branding";
import { SalarySlipWorkspace } from "@/features/docs/salary-slip/components/salary-slip-workspace";

interface WorkspaceEmployee {
  id: string;
  name: string;
  email: string | null;
  employeeId: string | null;
  designation: string | null;
  department: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankIFSC: string | null;
  panNumber: string | null;
}

interface WorkspacePreset {
  id: string;
  name: string;
  components: { label: string; amount: number; type: "earning" | "deduction" }[];
}

interface BrandingWrapperProps {
  employees?: WorkspaceEmployee[];
  presets?: WorkspacePreset[];
  initialTemplateId?: string;
}

export function SalarySlipBrandingWrapper({
  employees = [],
  presets = [],
  initialTemplateId,
}: BrandingWrapperProps) {
  const branding = useOrgBranding();

  return (
    <div
      style={
        {
          "--brand-accent": branding.accentColor,
          "--brand-font": branding.fontFamily,
          "--brand-font-color": branding.fontColor,
        } as React.CSSProperties
      }
    >
      <SalarySlipWorkspace employees={employees} presets={presets} initialTemplateId={initialTemplateId} initialAccentColor={branding.accentColor} />
    </div>
  );
}
