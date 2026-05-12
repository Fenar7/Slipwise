import type { Metadata } from "next";
import { SettingsShell } from "@/components/settings/settings-shell";

export const metadata: Metadata = {
  title: "Settings — Slipwise",
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <SettingsShell>{children}</SettingsShell>;
}
