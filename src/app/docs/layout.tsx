"use client";

import AuthGate from "@/components/AuthGate";
import NavBar from "@/components/NavBar";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="min-h-screen bg-black flex flex-col">
        <NavBar />
        <main className="flex-1">{children}</main>
      </div>
    </AuthGate>
  );
}
