"use client";

import { useState, useRef } from "react";

interface AIAssistBarProps {
  docTypeId: string;
  cmsContext: {
    sellerBroker: { name: string; email: string; phone: string } | null;
    cre8Broker: { name: string; email: string; phone: string } | null;
    listing: { name: string; address: string } | null;
  };
  onExtracted: (variables: Record<string, string>) => void;
  onExtracting: (isExtracting: boolean) => void;
}

// Cycling status messages during extraction
const STATUS_MESSAGES = [
  "Reading deal terms...",
  "Extracting variables...",
  "Analyzing terms...",
];

export default function AIAssistBar({
  docTypeId,
  cmsContext,
  onExtracted,
  onExtracting,
}: AIAssistBarProps) {
  const [rawInput, setRawInput] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Start cycling status messages
  function startStatusCycle() {
    let index = 0;
    setStatusMessage(STATUS_MESSAGES[0]);
    statusIntervalRef.current = setInterval(() => {
      index = (index + 1) % STATUS_MESSAGES.length;
      setStatusMessage(STATUS_MESSAGES[index]);
    }, 2000);
  }

  // Stop cycling status messages
  function stopStatusCycle() {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
    setStatusMessage("");
  }

  // Handle Extract button click
  async function handleExtract() {
    if (!rawInput.trim()) return;

    setIsExtracting(true);
    setError("");
    onExtracting(true);
    startStatusCycle();

    try {
      const res = await fetch("/api/docs/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docType: docTypeId,
          rawInput,
          cmsContext: {
            sellerBroker: cmsContext.sellerBroker || null,
            cre8Broker: cmsContext.cre8Broker || null,
            listing: cmsContext.listing || null,
          },
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Extraction failed");
      }

      const result = await res.json();

      // Build flat variables from the extraction result (token → value)
      const flatVars: Record<string, string> = {};
      for (const [token, data] of Object.entries(result.variables || {})) {
        const extracted = data as { value: string };
        if (extracted.value) {
          flatVars[token] = extracted.value;
        }
      }

      onExtracted(flatVars);
    } catch (err) {
      console.error("AI extraction error:", err);
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setIsExtracting(false);
      onExtracting(false);
      stopStatusCycle();
    }
  }

  // Handle photo/image upload — reads image as base64, sends description to extract
  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read file and append info to the textarea
    const text = `[Uploaded image: ${file.name}] — Please extract deal terms from this document.`;
    setRawInput((prev) => (prev ? `${prev}\n${text}` : text));

    // Clear the input so the same file can be re-selected
    e.target.value = "";
  }

  // Focus textarea for voice dictation (user uses native keyboard mic)
  function handleVoiceFocus() {
    textareaRef.current?.focus();
  }

  return (
    <div className="bg-dark-gray border border-border-gray rounded-card overflow-hidden">
      {/* Header — click to expand/collapse */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-charcoal transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green" />
          <span className="text-white text-sm font-semibold">AI ASSIST</span>
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-medium-gray transition-transform duration-200 ${
            collapsed ? "" : "rotate-180"
          }`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Body — shown when expanded */}
      {!collapsed && (
        <div className="px-4 pb-4 space-y-3">
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder="Describe your deal — buyer, seller, property, price, terms..."
            rows={3}
            disabled={isExtracting}
            className="w-full bg-charcoal border border-border-gray rounded px-3 py-2
                       text-white text-sm placeholder:text-medium-gray
                       focus:border-green transition-colors resize-y leading-relaxed
                       disabled:opacity-50"
          />

          {/* Action buttons row */}
          <div className="flex items-center gap-2">
            {/* Extract button (primary) */}
            <button
              onClick={handleExtract}
              disabled={!rawInput.trim() || isExtracting}
              className="flex-1 bg-green text-black font-semibold text-sm py-2 px-4 rounded-btn
                         hover:brightness-110 transition-all duration-200
                         disabled:opacity-40 disabled:cursor-not-allowed
                         flex items-center justify-center gap-2"
            >
              {isExtracting ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  {statusMessage}
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                  Update LOI
                </>
              )}
            </button>

            {/* Voice button — focuses textarea for native dictation */}
            <button
              onClick={handleVoiceFocus}
              disabled={isExtracting}
              title="Focus for voice dictation"
              className="bg-charcoal border border-border-gray text-medium-gray p-2 rounded-btn
                         hover:border-green hover:text-white transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>

            {/* Photo button — file input for image/document */}
            <label
              title="Upload photo or document"
              className={`bg-charcoal border border-border-gray text-medium-gray p-2 rounded-btn
                         hover:border-green hover:text-white transition-colors cursor-pointer
                         ${isExtracting ? "opacity-40 pointer-events-none" : ""}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-red-400 text-xs">{error}</p>
          )}

          {/* Helper text */}
          <p className="text-medium-gray text-xs">
            Voice dictation available.
          </p>
        </div>
      )}
    </div>
  );
}
