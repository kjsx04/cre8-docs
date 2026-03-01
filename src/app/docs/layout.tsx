"use client";

import AppShell from "@/components/AppShell";

/**
 * Docs section layout — wraps all /docs pages in the shared AppShell
 * (AuthGate + NavBar + main container).
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
