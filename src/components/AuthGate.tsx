"use client";

import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { loginScopes } from "@/lib/msal-config";

interface AuthGateProps {
  children: React.ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const isAuthenticated = useIsAuthenticated();
  const { instance, inProgress } = useMsal();

  const handleLogin = async () => {
    try {
      await instance.loginPopup(loginScopes);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  // Still loading auth state
  if (inProgress !== InteractionStatus.None) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Not authenticated — show login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          {/* Logo / Title */}
          <h1 className="font-bebas text-5xl tracking-wide text-white mb-2">
            CRE8 <span className="text-green">ADMIN</span>
          </h1>
          <p className="text-medium-gray text-sm mb-8">
            Sign in to manage listings and documents
          </p>

          {/* Sign in button */}
          <button
            onClick={handleLogin}
            className="w-full bg-dark-gray border border-border-gray rounded-btn px-6 py-3
                       text-white font-dm text-sm font-semibold
                       hover:border-green transition-colors duration-200
                       flex items-center justify-center gap-3"
          >
            {/* Microsoft icon */}
            <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
              <rect x="1" y="1" width="9" height="9" fill="#F25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
              <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
            </svg>
            Sign in with Microsoft
          </button>

          <p className="text-border-gray text-xs mt-6">
            CRE8 Advisors team members only
          </p>
        </div>
      </div>
    );
  }

  // Authenticated — render children
  return <>{children}</>;
}
