"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import { getDocTypeBySlug, SP_DRAFTS_FOLDER } from "@/lib/constants";
import { graphScopes } from "@/lib/msal-config";
import {
  getSiteId,
  getDriveId,
  uploadToSharePoint,
  getWordUrl,
} from "@/lib/graph";
import LoadingSpinner from "@/components/LoadingSpinner";
import DocPreview from "@/components/DocPreview";
import FolderPicker from "@/components/FolderPicker";
import SharePointBreadcrumb from "@/components/SharePointBreadcrumb";

type PageState = "preview" | "saving" | "saved" | "error";

// localStorage key for remembering the user's chosen folder
const LS_FOLDER_KEY = "cre8_docs_save_folder";

export default function CompletePage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.type as string;
  const docType = getDocTypeBySlug(slug);
  const { instance, accounts } = useMsal();

  const [pageState, setPageState] = useState<PageState>("preview");
  const [sharePointUrl, setSharePointUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileBase64, setFileBase64] = useState("");

  // Save folder — check localStorage first, then fall back to constant
  const [saveFolder, setSaveFolder] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(LS_FOLDER_KEY) || SP_DRAFTS_FOLDER;
    }
    return SP_DRAFTS_FOLDER;
  });

  // Folder picker modal state
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  // Graph API IDs (fetched once when needed)
  const [driveId, setDriveId] = useState("");
  const [accessToken, setAccessToken] = useState("");

  // Load the generated file from sessionStorage on mount
  useEffect(() => {
    if (!docType) return;

    const stored = sessionStorage.getItem(`generated_${docType.id}`);
    if (!stored) {
      router.push(`/docs/${slug}`);
      return;
    }

    const parsed = JSON.parse(stored);
    setFileName(parsed.fileName);
    setFileBase64(parsed.fileBase64);
  }, [docType, slug, router]);

  // Pre-fetch Graph API token and drive ID in background (needed for folder picker + upload)
  useEffect(() => {
    const account = accounts[0];
    if (!account) return;

    async function fetchGraphIds() {
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          ...graphScopes,
          account: accounts[0],
        });
        setAccessToken(tokenResponse.accessToken);

        const siteId = await getSiteId(tokenResponse.accessToken);
        const drive = await getDriveId(tokenResponse.accessToken, siteId);
        setDriveId(drive);
      } catch (err) {
        console.error("Failed to pre-fetch Graph IDs:", err);
      }
    }

    fetchGraphIds();
  }, [instance, accounts]);

  // Persist folder choice to localStorage
  function updateSaveFolder(folder: string) {
    setSaveFolder(folder);
    localStorage.setItem(LS_FOLDER_KEY, folder);
  }

  // Convert base64 data URL to ArrayBuffer
  function base64ToArrayBuffer(dataUrl: string): ArrayBuffer {
    const base64Data = dataUrl.split(",")[1];
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Download file locally
  const downloadFile = useCallback(() => {
    if (!fileBase64 || !fileName) return;
    const link = document.createElement("a");
    link.href = fileBase64;
    link.download = fileName;
    link.click();
  }, [fileBase64, fileName]);

  // Upload to SharePoint
  async function handleSave() {
    setPageState("saving");

    try {
      const account = accounts[0];
      if (!account) throw new Error("Not authenticated");

      // Use cached token/drive or fetch fresh ones
      let token = accessToken;
      let drive = driveId;

      if (!token || !drive) {
        const tokenResponse = await instance.acquireTokenSilent({
          ...graphScopes,
          account,
        });
        token = tokenResponse.accessToken;
        const siteId = await getSiteId(token);
        drive = await getDriveId(token, siteId);
        setAccessToken(token);
        setDriveId(drive);
      }

      const arrayBuffer = base64ToArrayBuffer(fileBase64);

      // Use getSiteId to get the siteId for the upload call
      const siteId = await getSiteId(token);

      const webUrl = await uploadToSharePoint(
        token,
        siteId,
        drive,
        saveFolder,
        fileName,
        arrayBuffer
      );

      setSharePointUrl(webUrl);
      setPageState("saved");

      // Clean up sessionStorage
      sessionStorage.removeItem(`extraction_${docType!.id}`);
      sessionStorage.removeItem(`generated_${docType!.id}`);
    } catch (err) {
      console.error("SharePoint upload error:", err);
      setPageState("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to save to SharePoint"
      );
    }
  }

  // Extract display name from folder path for the "Save to" line
  function folderDisplayName(path: string): string {
    const segments = path.split("/").filter(Boolean);
    return segments[segments.length - 1] || "Root";
  }

  if (!docType) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12 text-center">
        <p className="text-medium-gray">Document type not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      {/* Header */}
      <h1 className="font-bebas text-3xl tracking-wide text-white mb-1 text-center">
        DOCUMENT <span className="text-green">PREVIEW</span>
      </h1>
      <p className="text-medium-gray text-sm text-center mb-6">
        {docType.name}
      </p>

      {/* Document Preview — always visible */}
      {fileBase64 && <DocPreview fileBase64={fileBase64} />}

      {/* Below-preview content changes by state */}
      <div className="mt-6">
        {/* ── PREVIEW state: file info + save controls ── */}
        {pageState === "preview" && (
          <>
            {/* File name */}
            <p className="text-white text-sm mb-3 truncate">{fileName}</p>

            {/* Save location row */}
            <div className="flex items-center gap-2 mb-6">
              <span className="text-medium-gray text-sm">Save to:</span>
              <span className="text-white text-sm font-semibold">
                {folderDisplayName(saveFolder)}
              </span>
              <button
                onClick={() => setShowFolderPicker(true)}
                disabled={!driveId || !accessToken}
                className="text-green text-sm hover:underline disabled:text-border-gray disabled:cursor-not-allowed"
              >
                {driveId && accessToken ? "Change" : "Loading..."}
              </button>
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              <button
                onClick={handleSave}
                className="w-full bg-green text-black font-semibold text-sm py-3 rounded-btn
                           hover:brightness-110 transition-all duration-200
                           flex items-center justify-center gap-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Save to SharePoint
              </button>

              <button
                onClick={downloadFile}
                className="w-full bg-dark-gray border border-border-gray text-white font-semibold text-sm py-3 rounded-btn
                           hover:border-green transition-colors duration-200
                           flex items-center justify-center gap-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download File
              </button>
            </div>
          </>
        )}

        {/* ── SAVING state ── */}
        {pageState === "saving" && (
          <div className="text-center py-6">
            <LoadingSpinner message="Saving to SharePoint..." size="lg" />
          </div>
        )}

        {/* ── SAVED state ── */}
        {pageState === "saved" && (
          <>
            {/* Success indicator */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-green/15 flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8CC644" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17L4 12" />
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Document Saved</p>
                <p className="text-medium-gray text-xs">{fileName}</p>
              </div>
            </div>

            {/* Breadcrumb showing where it was saved */}
            <div className="mb-6">
              <SharePointBreadcrumb folderPath={saveFolder} />
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              {/* Open in Word (desktop) */}
              <a
                href={getWordUrl(sharePointUrl)}
                className="w-full bg-green text-black font-semibold text-sm py-3 rounded-btn
                           hover:brightness-110 transition-all duration-200
                           flex items-center justify-center gap-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                Open in Word
              </a>

              {/* Open in Word Online */}
              <a
                href={sharePointUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-dark-gray border border-border-gray text-white font-semibold text-sm py-3 rounded-btn
                           hover:border-green transition-colors duration-200
                           flex items-center justify-center gap-2"
              >
                Open in Word Online
              </a>

              {/* Start new document */}
              <button
                onClick={() => router.push("/docs")}
                className="w-full text-medium-gray text-sm py-3 hover:text-white transition-colors"
              >
                Start New Document
              </button>
            </div>
          </>
        )}

        {/* ── ERROR state ── */}
        {pageState === "error" && (
          <>
            {/* Error indicator */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Save Failed</p>
                <p className="text-red-400 text-xs">{errorMessage}</p>
              </div>
            </div>

            {/* Retry / fallback buttons */}
            <div className="space-y-3 mt-6">
              <button
                onClick={() => {
                  setPageState("preview");
                  setErrorMessage("");
                }}
                className="w-full bg-green text-black font-semibold text-sm py-3 rounded-btn
                           hover:brightness-110 transition-all duration-200
                           flex items-center justify-center gap-2"
              >
                Try Again
              </button>

              <button
                onClick={downloadFile}
                className="w-full bg-dark-gray border border-border-gray text-white font-semibold text-sm py-3 rounded-btn
                           hover:border-green transition-colors duration-200
                           flex items-center justify-center gap-2"
              >
                Download File Instead
              </button>

              <button
                onClick={() => router.push("/docs")}
                className="w-full text-medium-gray text-sm py-3 hover:text-white transition-colors"
              >
                Start New Document
              </button>
            </div>
          </>
        )}
      </div>

      {/* Folder Picker Modal */}
      {showFolderPicker && driveId && accessToken && (
        <FolderPicker
          accessToken={accessToken}
          driveId={driveId}
          currentPath={saveFolder}
          onSelect={updateSaveFolder}
          onClose={() => setShowFolderPicker(false)}
        />
      )}
    </div>
  );
}
