import { MailboxLeftRail } from "../mailbox-left-rail";

export default function MailboxSettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full overflow-hidden" style={{ background: "#F7F8FB" }}>
      <MailboxLeftRail />
      <main
        className="flex-1 overflow-y-auto"
        style={{ background: "#F7F8FB" }}
        data-testid="mailbox-settings-main"
      >
        {children}
      </main>
    </div>
  );
}
