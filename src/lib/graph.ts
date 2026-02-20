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
