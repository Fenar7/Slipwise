export default function MailboxLayout({ children }: { children: React.ReactNode }) {
  return (
    // Full-height, no overflow — mailbox manages its own scroll zones
    <div className="flex h-full flex-col overflow-hidden">{children}</div>
  );
}
