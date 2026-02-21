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
        <img
          src="https://cdn.prod.website-files.com/66f22f3dc46f9da5825ff2f7/6717f6e1c60fe16248597819_CRE8%20White.svg"
          alt="CRE8 Advisors"
          className="h-7 w-auto"
        />
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
