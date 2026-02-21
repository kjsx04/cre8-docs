"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { useMsal } from "@azure/msal-react";
import {
  getDocTypeBySlug,
  getVariableMap,
  getFieldSections,
  SP_DRAFTS_FOLDER,
  FieldSection,
} from "@/lib/constants";
import { VariableDef } from "@/lib/types";
import { graphScopes } from "@/lib/msal-config";
import {
  getSiteId,
  getDriveId,
  uploadToSharePoint,
  getWordUrl,
} from "@/lib/graph";
import {
  numberToWritten,
  dollarToWritten,
  formatCurrency,
} from "@/lib/number-to-words";
import LoadingSpinner from "@/components/LoadingSpinner";
import DocPreview from "@/components/DocPreview";
import FolderPicker from "@/components/FolderPicker";
import SharePointBreadcrumb from "@/components/SharePointBreadcrumb";

type PageState = "preview" | "saving" | "saved" | "error";

// localStorage key for remembering the user's chosen folder
const LS_FOLDER_KEY = "cre8_docs_save_folder";

// ── Collapsible section card for the field sidebar ──
function CollapsibleSection({
  section,
  varMap,
  writtenTokens,
  fieldValues,
  onFieldChange,
}: {
  section: FieldSection;
  varMap: Map<string, VariableDef>;
  writtenTokens: Set<string>;
  fieldValues: Record<string, string>;
  onFieldChange: (token: string, value: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  // Filter out written variant tokens — they're auto-computed, not editable
  const editableTokens = section.tokens.filter((t) => !writtenTokens.has(t));

  // Count filled fields
  const filledCount = editableTokens.filter(
    (t) => fieldValues[t] && fieldValues[t].trim() !== ""
  ).length;

  return (
    <div className="bg-dark-gray border border-border-gray rounded-card overflow-hidden">
      {/* Section header — click to expand/collapse */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-charcoal transition-colors"
      >
        <span className="text-white text-sm font-semibold">{section.title}</span>
        <div className="flex items-center gap-2">
          <span className="text-medium-gray text-xs">
            {filledCount}/{editableTokens.length}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-medium-gray transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Fields — shown when expanded */}
      {expanded && (
        <div className="px-4 pb-3 space-y-3">
          {editableTokens.map((token) => {
            const def = varMap.get(token);
            const label = def?.label || token.replace(/_/g, " ");
            return (
              <div key={token}>
                <label className="block text-medium-gray text-xs mb-1">
                  {label}
                </label>
                <input
                  type="text"
                  value={fieldValues[token] || ""}
                  onChange={(e) => onFieldChange(token, e.target.value)}
                  className="w-full bg-charcoal border border-border-gray rounded px-3 py-1.5
                             text-white text-sm focus:border-green transition-colors"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Field Sidebar ──
function FieldSidebar({
  sections,
  writtenTokens,
  varMap,
  fieldValues,
  onFieldChange,
}: {
  sections: FieldSection[];
  writtenTokens: Set<string>;
  varMap: Map<string, VariableDef>;
  fieldValues: Record<string, string>;
  onFieldChange: (token: string, value: string) => void;
}) {
  return (
    <div className="space-y-3 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 180px)" }}>
      <h2 className="font-bebas text-lg tracking-wide text-medium-gray mb-1">
        EDIT FIELDS
      </h2>
      {sections.map((section) => (
        <CollapsibleSection
          key={section.title}
          section={section}
          varMap={varMap}
          writtenTokens={writtenTokens}
          fieldValues={fieldValues}
          onFieldChange={onFieldChange}
        />
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════
// ── Main Complete Page Component ──
// ══════════════════════════════════════════════════
export default function CompletePage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.type as string;
  const docType = getDocTypeBySlug(slug);
  const { instance, accounts } = useMsal();

  // Page state
  const [pageState, setPageState] = useState<PageState>("preview");
  const [sharePointUrl, setSharePointUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileBase64, setFileBase64] = useState("");

  // Field editing state
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [clausePayload, setClausePayload] = useState<
    { id: string; included: boolean; variables: Record<string, string>; customText?: string }[]
  >([]);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Ref that mirrors fieldValues — the debounced callback reads from here
  // to always get the latest values (avoids stale closure)
  const fieldValuesRef = useRef<Record<string, string>>({});

  // Debounce timer ref
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

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

  // Variable metadata for the field sidebar (memoized so hooks don't re-fire)
  const varDefs = useMemo(
    () => (docType ? getVariableMap(docType.id) : []),
    [docType]
  );
  const sections = useMemo(
    () => (docType ? getFieldSections(docType.id) : []),
    [docType]
  );
  const varMap = useMemo(
    () => new Map(varDefs.map((v) => [v.token, v])),
    [varDefs]
  );
  const writtenTokens = useMemo(
    () => new Set(varDefs.filter((v) => v.writtenVariant).map((v) => v.writtenVariant!)),
    [varDefs]
  );

  // ── Load generated file + payload from sessionStorage on mount ──
  useEffect(() => {
    if (!docType) return;

    // Load the generated doc (base64 + filename)
    const storedDoc = sessionStorage.getItem(`generated_${docType.id}`);
    if (!storedDoc) {
      router.push(`/docs/${slug}`);
      return;
    }
    const parsedDoc = JSON.parse(storedDoc);
    setFileName(parsedDoc.fileName);
    setFileBase64(parsedDoc.fileBase64);

    // Load the generate payload (field values + clauses)
    const storedPayload = sessionStorage.getItem(`generate_payload_${docType.id}`);
    if (storedPayload) {
      const parsedPayload = JSON.parse(storedPayload);
      setFieldValues(parsedPayload.variables || {});
      fieldValuesRef.current = parsedPayload.variables || {};
      setClausePayload(parsedPayload.clauses || []);
    }
  }, [docType, slug, router]);

  // ── Pre-fetch Graph API token and drive ID ──
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

  // ── Regenerate the document with updated field values ──
  const regenerateDocument = useCallback(async () => {
    if (!docType) return;
    setIsRegenerating(true);

    try {
      // Read latest values from the ref (not state — avoids stale closure)
      const currentValues = { ...fieldValuesRef.current };

      const res = await fetch("/api/docs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docType: docType.id,
          variables: currentValues,
          clauses: clausePayload,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Regeneration failed");
      }

      // Convert the response blob to base64 for DocPreview
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setFileBase64(base64);
        setIsRegenerating(false);

        // Also update sessionStorage so a page refresh keeps the latest version
        sessionStorage.setItem(
          `generated_${docType.id}`,
          JSON.stringify({
            fileBase64: base64,
            fileName,
            docType: docType.id,
          })
        );
        sessionStorage.setItem(
          `generate_payload_${docType.id}`,
          JSON.stringify({ variables: currentValues, clauses: clausePayload })
        );
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error("Regeneration error:", err);
      setIsRegenerating(false);
    }
  }, [docType, clausePayload, fileName]);

  // ── Handle a field value change (with debounced regen) ──
  const handleFieldChange = useCallback(
    (token: string, value: string) => {
      setFieldValues((prev) => {
        const updated = { ...prev, [token]: value };

        // Auto-compute written variants for number fields
        const def = varMap.get(token);
        if (def?.numberField && def.writtenVariant) {
          const isDollar =
            token.includes("money") ||
            token.includes("deposit") ||
            token.includes("price");

          if (isDollar) {
            const formatted = formatCurrency(value);
            updated[token] = formatted;
            updated[def.writtenVariant] = dollarToWritten(value);
          } else {
            updated[def.writtenVariant] = numberToWritten(value);
          }
        }

        // Mirror to the ref so the debounced callback gets the latest
        fieldValuesRef.current = updated;
        return updated;
      });

      // Start/reset the 1.5s debounce timer for regeneration
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        regenerateDocument();
      }, 1500);
    },
    [varMap, regenerateDocument]
  );

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

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
      sessionStorage.removeItem(`generate_payload_${docType!.id}`);
    } catch (err) {
      console.error("SharePoint upload error:", err);
      setPageState("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to save to SharePoint"
      );
    }
  }

  // ── Guards ──
  if (!docType) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12 text-center">
        <p className="text-medium-gray">Document type not found.</p>
      </div>
    );
  }

  // ══════════════════════════════════════════════════
  // ── Bottom Bar — renders different content per state ──
  // ══════════════════════════════════════════════════
  function BottomBar() {
    // PREVIEW state — save controls
    if (pageState === "preview") {
      return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Save-to location + change button */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-medium-gray text-sm flex-shrink-0">Save to:</span>
            <SharePointBreadcrumb folderPath={saveFolder} />
            <button
              onClick={() => setShowFolderPicker(true)}
              disabled={!driveId || !accessToken}
              className="text-green text-sm hover:underline disabled:text-border-gray disabled:cursor-not-allowed flex-shrink-0"
            >
              {driveId && accessToken ? "Change" : "Loading..."}
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={downloadFile}
              className="bg-dark-gray border border-border-gray text-white font-semibold text-sm px-5 py-2.5 rounded-btn
                         hover:border-green transition-colors duration-200
                         flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download
            </button>
            <button
              onClick={handleSave}
              disabled={isRegenerating}
              className="bg-green text-black font-semibold text-sm px-5 py-2.5 rounded-btn
                         hover:brightness-110 transition-all duration-200
                         flex items-center gap-2
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Save to SharePoint
            </button>
          </div>
        </div>
      );
    }

    // SAVING state
    if (pageState === "saving") {
      return (
        <div className="flex items-center justify-center py-2">
          <LoadingSpinner message="Saving to SharePoint..." />
        </div>
      );
    }

    // SAVED state
    if (pageState === "saved") {
      return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Saved confirmation + breadcrumb */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-6 h-6 rounded-full bg-green/15 flex items-center justify-center flex-shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8CC644" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17L4 12" />
              </svg>
            </div>
            <span className="text-green text-sm font-semibold flex-shrink-0">Saved</span>
            <SharePointBreadcrumb folderPath={saveFolder} />
          </div>

          {/* Post-save actions */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <a
              href={getWordUrl(sharePointUrl)}
              className="bg-green text-black font-semibold text-sm px-5 py-2.5 rounded-btn
                         hover:brightness-110 transition-all duration-200
                         flex items-center gap-2"
            >
              Open in Word
            </a>
            <a
              href={sharePointUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-dark-gray border border-border-gray text-white font-semibold text-sm px-5 py-2.5 rounded-btn
                         hover:border-green transition-colors duration-200
                         flex items-center gap-2"
            >
              Word Online
            </a>
            <button
              onClick={() => router.push("/docs")}
              className="text-medium-gray text-sm hover:text-white transition-colors px-3 py-2.5"
            >
              New
            </button>
          </div>
        </div>
      );
    }

    // ERROR state
    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-6 h-6 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <span className="text-red-400 text-sm">{errorMessage}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => {
              setPageState("preview");
              setErrorMessage("");
            }}
            className="bg-green text-black font-semibold text-sm px-5 py-2.5 rounded-btn
                       hover:brightness-110 transition-all duration-200"
          >
            Try Again
          </button>
          <button
            onClick={downloadFile}
            className="bg-dark-gray border border-border-gray text-white font-semibold text-sm px-5 py-2.5 rounded-btn
                       hover:border-green transition-colors duration-200"
          >
            Download Instead
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════
  // ── Render ──
  // ══════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border-gray flex-shrink-0">
        <h1 className="font-bebas text-2xl tracking-wide text-white">
          DOCUMENT <span className="text-green">PREVIEW</span>
        </h1>
        <span className="text-medium-gray text-sm">{docType.name}</span>
      </div>

      {/* Split pane: preview (left) + fields (right) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left — Doc Preview */}
        <div className="lg:w-[65%] w-full relative overflow-y-auto p-4">
          {/* Regenerating overlay */}
          {isRegenerating && (
            <div className="absolute inset-0 bg-black/40 z-20 flex items-center justify-center rounded-lg">
              <div className="flex items-center gap-3 bg-charcoal px-5 py-3 rounded-card border border-border-gray">
                <div className="w-5 h-5 border-2 border-green border-t-transparent rounded-full animate-spin" />
                <span className="text-white text-sm">Updating...</span>
              </div>
            </div>
          )}

          {fileBase64 && <DocPreview fileBase64={fileBase64} />}

          {/* File name below preview */}
          <p className="text-medium-gray text-xs mt-2 truncate">{fileName}</p>
        </div>

        {/* Right — Editable Fields Sidebar */}
        <div className="lg:w-[35%] w-full border-t lg:border-t-0 lg:border-l border-border-gray overflow-y-auto p-4">
          {Object.keys(fieldValues).length > 0 ? (
            <FieldSidebar
              sections={sections}
              writtenTokens={writtenTokens}
              varMap={varMap}
              fieldValues={fieldValues}
              onFieldChange={handleFieldChange}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-medium-gray text-sm">Loading fields...</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar — full width, always visible */}
      <div className="border-t border-border-gray px-6 py-3 flex-shrink-0 bg-charcoal">
        <BottomBar />
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
