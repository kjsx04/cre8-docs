"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import { getDocTypeBySlug } from "@/lib/constants";
import { graphScopes } from "@/lib/msal-config";
import { getSiteId, getDriveId, uploadToSharePoint, getWordUrl } from "@/lib/graph";
import LoadingSpinner from "@/components/LoadingSpinner";

type SaveStatus = "saving" | "saved" | "error";

export default function CompletePage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.type as string;
  const docType = getDocTypeBySlug(slug);
  const { instance, accounts } = useMsal();

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saving");
  const [sharePointUrl, setSharePointUrl] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");

  useEffect(() => {
    if (!docType) return;

    const stored = sessionStorage.getItem(`generated_${docType.id}`);
    if (!stored) {
      router.push(`/docs/${slug}`);
      return;
    }

    const { fileBase64, fileName: storedFileName } = JSON.parse(stored);
    setFileName(storedFileName);

    // Upload to SharePoint
    async function uploadFile() {
      try {
        // Get Graph API token
        const account = accounts[0];
        if (!account) throw new Error("Not authenticated");

        const tokenResponse = await instance.acquireTokenSilent({
          ...graphScopes,
          account,
        });

        const accessToken = tokenResponse.accessToken;

        // Convert base64 data URL back to ArrayBuffer
        const base64Data = fileBase64.split(",")[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const arrayBuffer = bytes.buffer;

        // Get SharePoint site and drive IDs
        const siteId = await getSiteId(accessToken);
        const driveId = await getDriveId(accessToken, siteId);

        // Upload the file
        const webUrl = await uploadToSharePoint(
          accessToken,
          siteId,
          driveId,
          docType!.sharePointFolder,
          storedFileName,
          arrayBuffer
        );

        setSharePointUrl(webUrl);
        setSaveStatus("saved");

        // Clean up sessionStorage
        sessionStorage.removeItem(`extraction_${docType!.id}`);
        sessionStorage.removeItem(`generated_${docType!.id}`);
      } catch (err) {
        console.error("SharePoint upload error:", err);
        setSaveStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to save to SharePoint"
        );
      }
    }

    uploadFile();
  }, [docType, slug, router, instance, accounts]);

  if (!docType) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12 text-center">
        <p className="text-medium-gray">Document type not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-20">
      <div className="text-center">
        {/* Status icon */}
        {saveStatus === "saving" && (
          <div className="mb-6">
            <LoadingSpinner message="Saving to SharePoint..." size="lg" />
          </div>
        )}

        {saveStatus === "saved" && (
          <>
            {/* Success checkmark */}
            <div className="w-16 h-16 rounded-full bg-green/15 flex items-center justify-center mx-auto mb-6">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#8CC644"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6L9 17L4 12" />
              </svg>
            </div>

            <h1 className="font-bebas text-3xl tracking-wide text-white mb-2">
              DOCUMENT <span className="text-green">SAVED</span>
            </h1>

            <p className="text-medium-gray text-sm mb-2">{fileName}</p>
            <p className="text-border-gray text-xs mb-8">
              Saved to SharePoint · Autosave is on
            </p>

            {/* Action buttons */}
            <div className="space-y-3">
              {/* Open in Word */}
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

              {/* Open in Word Online (fallback) */}
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

        {saveStatus === "error" && (
          <>
            {/* Error icon */}
            <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-6">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#EF4444"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>

            <h1 className="font-bebas text-3xl tracking-wide text-white mb-2">
              SAVE <span className="text-red-500">FAILED</span>
            </h1>

            <p className="text-medium-gray text-sm mb-2">
              The document was generated but couldn&apos;t be saved to SharePoint.
            </p>
            <p className="text-red-400 text-xs mb-8">{errorMessage}</p>

            {/* Fallback: download locally */}
            <div className="space-y-3">
              <button
                onClick={() => {
                  // Download the generated file locally as fallback
                  const stored = sessionStorage.getItem(`generated_${docType.id}`);
                  if (stored) {
                    const { fileBase64, fileName: fn } = JSON.parse(stored);
                    const link = document.createElement("a");
                    link.href = fileBase64;
                    link.download = fn;
                    link.click();
                  }
                }}
                className="w-full bg-green text-black font-semibold text-sm py-3 rounded-btn
                           hover:brightness-110 transition-all duration-200
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
    </div>
  );
}
