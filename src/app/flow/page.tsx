"use client";

/**
 * Flow page — embeds the cre8-flow deal tracker app via iframe.
 * The iframe fills all remaining viewport height below the NavBar (h-14 = 56px).
 */
export default function FlowPage() {
  return (
    <iframe
      src="https://cre8-flow.vercel.app"
      title="CRE8 Flow — Deal Tracker"
      className="w-full border-0"
      style={{ height: "calc(100vh - 56px)" }}
      allow="clipboard-write"
    />
  );
}
