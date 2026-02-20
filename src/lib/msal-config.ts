import { Configuration, LogLevel } from "@azure/msal-browser";

// Same Azure app registration as the existing admin portal
const CLIENT_ID = process.env.NEXT_PUBLIC_MSAL_CLIENT_ID || "c1bd941f-3240-412e-a22a-7c6296549c06";
const TENANT_ID = process.env.NEXT_PUBLIC_MSAL_TENANT_ID || "74141c21-622f-43c7-869b-bd054d088c19";

export const msalConfig: Configuration = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: typeof window !== "undefined" ? window.location.origin : "",
    postLogoutRedirectUri: typeof window !== "undefined" ? window.location.origin : "",
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message) => {
        if (level === LogLevel.Error) {
          console.error("[MSAL]", message);
        }
      },
      logLevel: LogLevel.Error,
    },
  },
};

// Scopes needed for SharePoint file operations
export const loginScopes = {
  scopes: ["User.Read", "Files.ReadWrite.All", "Sites.ReadWrite.All"],
};

// Graph API scopes for silent token acquisition
export const graphScopes = {
  scopes: ["Files.ReadWrite.All", "Sites.ReadWrite.All"],
};
