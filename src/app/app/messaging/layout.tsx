export default function MessagingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full overflow-hidden" data-testid="messaging-layout">
      {children}
    </div>
  );
}

import React from "react";
