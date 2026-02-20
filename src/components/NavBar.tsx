"use client";

import { useMsal } from "@azure/msal-react";

export default function NavBar() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const userName = account?.name || account?.username || "User";

  const handleSignOut = () => {
    instance.logoutPopup();
  };

  return (
    <nav className="h-14 bg-charcoal border-b border-border-gray flex items-center justify-between px-6">
      {/* Left: App title */}
      <div className="flex items-center gap-3">
        <span className="font-bebas text-xl tracking-wide text-white">
          CRE8 DOCS
        </span>
        <span className="text-border-gray">|</span>
        <span className="text-medium-gray text-sm">Document Assistant</span>
      </div>

      {/* Right: User name + sign out */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-medium-gray">{userName}</span>
        <button
          onClick={handleSignOut}
          className="text-sm text-medium-gray hover:text-white transition-colors duration-200"
        >
          Sign Out
        </button>
      </div>
    </nav>
  );
}
