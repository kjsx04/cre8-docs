// SharePoint Graph API helpers
// Uses the user's MSAL auth token to interact with SharePoint

import { SP_SITE_URL } from "./constants";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/**
 * Get the SharePoint site ID for the CRE8 Operations site
 */
export async function getSiteId(accessToken: string): Promise<string> {
  // Extract hostname and site path from SP_SITE_URL
  const url = new URL(SP_SITE_URL);
  const hostname = url.hostname; // cre8advisors.sharepoint.com
  const sitePath = url.pathname.replace(/^\/sites\//, ""); // CRE8Operations

  const response = await fetch(
    `${GRAPH_BASE}/sites/${hostname}:/sites/${sitePath}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get site ID: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Get the default document library drive ID
 */
export async function getDriveId(accessToken: string, siteId: string): Promise<string> {
  const response = await fetch(
    `${GRAPH_BASE}/sites/${siteId}/drive`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get drive: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Upload a file to a SharePoint folder
 * Returns the SharePoint web URL for the uploaded file
 */
export async function uploadToSharePoint(
  accessToken: string,
  siteId: string,
  driveId: string,
  folderPath: string,
  fileName: string,
  fileContent: ArrayBuffer
): Promise<string> {
  // Encode the full path for the API
  const fullPath = `${folderPath}${fileName}`.replace(/^\//, "");
  const encodedPath = encodeURIComponent(fullPath).replace(/%2F/g, "/");

  const response = await fetch(
    `${GRAPH_BASE}/drives/${driveId}/root:/${encodedPath}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      body: fileContent,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SharePoint upload failed: ${response.status} — ${errorText}`);
  }

  const data = await response.json();
  return data.webUrl;
}

/**
 * Generate the "Open in Word" URL for a SharePoint file
 * This opens the file in Word desktop (falls back to Word Online)
 */
export function getWordUrl(sharePointUrl: string): string {
  // ms-word protocol handler opens the file in Word desktop
  return `ms-word:ofe|u|${sharePointUrl}`;
}

// ── Folder browsing helpers ──

export interface FolderItem {
  id: string;
  name: string;
  isFolder: boolean;
  webUrl: string;
}

/**
 * List children (folders only) of a SharePoint folder.
 * Pass folderPath like "/CRE8 Advisors/Documents" or "" for the drive root.
 */
export async function listFolderChildren(
  accessToken: string,
  driveId: string,
  folderPath: string
): Promise<FolderItem[]> {
  // Build the endpoint — root vs. subpath
  const cleanPath = folderPath.replace(/^\/+/, "").replace(/\/+$/, "");
  const endpoint = cleanPath
    ? `${GRAPH_BASE}/drives/${driveId}/root:/${encodeURIComponent(cleanPath).replace(/%2F/g, "/")}:/children`
    : `${GRAPH_BASE}/drives/${driveId}/root/children`;

  // Filter to only folders, sort alphabetically
  const url = `${endpoint}?$filter=folder ne null&$orderby=name&$top=100`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to list folders: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return (data.value || []).map((item: Record<string, unknown>) => ({
    id: item.id as string,
    name: item.name as string,
    isFolder: true,
    webUrl: item.webUrl as string,
  }));
}

/**
 * Create a folder in SharePoint. Graph API auto-creates parent folders.
 * Returns the created folder's web URL.
 */
export async function createFolder(
  accessToken: string,
  driveId: string,
  parentPath: string,
  folderName: string
): Promise<string> {
  const cleanParent = parentPath.replace(/^\/+/, "").replace(/\/+$/, "");
  const endpoint = cleanParent
    ? `${GRAPH_BASE}/drives/${driveId}/root:/${encodeURIComponent(cleanParent).replace(/%2F/g, "/")}:/children`
    : `${GRAPH_BASE}/drives/${driveId}/root/children`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    }),
  });

  if (!response.ok) {
    // 409 = already exists, which is fine
    if (response.status === 409) {
      return "";
    }
    throw new Error(`Failed to create folder: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.webUrl;
}
