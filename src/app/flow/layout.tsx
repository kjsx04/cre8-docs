"use client";

import AppShell from "@/components/AppShell";

/**
 * Flow section layout — wraps all /flow pages in the shared AppShell
 * (AuthGate + NavBar + main container).
 */
export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
