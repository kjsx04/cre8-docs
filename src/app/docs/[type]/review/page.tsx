"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { getDocTypeBySlug, getVariableMap, getFieldSections } from "@/lib/constants";
import { CLAUSE_LIBRARY } from "@/lib/clause-library";
import { ExtractedVariable, ClauseState } from "@/lib/types";
import { numberToWritten, dollarToWritten, formatCurrency } from "@/lib/number-to-words";
import ReviewField from "@/components/ReviewField";
import ClauseCard from "@/components/ClauseCard";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function ReviewPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.type as string;
  const docType = getDocTypeBySlug(slug);

  const [variables, setVariables] = useState<Record<string, ExtractedVariable>>({});
  const [clauses, setClauses] = useState<ClauseState[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load extraction result from sessionStorage
  useEffect(() => {
    if (!docType) return;

    const stored = sessionStorage.getItem(`extraction_${docType.id}`);
    if (!stored) {
      // No extraction data — redirect back to input
      router.push(`/docs/${slug}`);
      return;
    }

    const { result } = JSON.parse(stored);

    // Set variables
    setVariables(result.variables || {});

    // Build clause states from detected clauses
    const clauseStates: ClauseState[] = (result.clauses || []).map(
      (c: { id: string; detected: boolean; source: string; variables: Record<string, string>; customText?: string }) => {
        const clauseDef = CLAUSE_LIBRARY.find((def) => def.id === c.id);

        // Build the rendered clause text
        let text = clauseDef?.template || c.customText || "";
        if (clauseDef && c.variables) {
          for (const [varToken, varValue] of Object.entries(c.variables)) {
            text = text.replace(
              new RegExp(`\\{\\{${varToken}\\}\\}`, "g"),
              varValue
            );
          }
        }

        // Build summary from variables
        const summaryParts = Object.entries(c.variables || {}).map(
          ([k, v]) => `${k.replace(/_/g, " ")}: ${v}`
        );

        return {
          id: c.id,
          included: c.detected,
          source: (c.source as "logic" | "library" | "ai_drafted") || "library",
          label: clauseDef?.label || c.id.replace(/_/g, " "),
          summary: summaryParts.join(" · ") || "No parameters",
          text,
          variables: c.variables || {},
          expanded: c.source === "ai_drafted",
        };
      }
    );

    setClauses(clauseStates);
    setLoaded(true);
  }, [docType, router, slug]);

  // Handle variable value changes
  const handleVariableChange = useCallback(
    (token: string, value: string) => {
      setVariables((prev) => {
        const updated = {
          ...prev,
          [token]: { ...prev[token], value },
        };

        // Auto-generate written variants for number fields
        const varMap = getVariableMap(docType?.id || "");
        const varDef = varMap.find((v) => v.token === token);

        if (varDef?.numberField && varDef.writtenVariant) {
          // Check if this is a dollar amount field
          const isDollar = token.includes("money") || token.includes("deposit") || token.includes("price");

          if (isDollar) {
            // Format as currency + generate written
            const formatted = formatCurrency(value);
            updated[token] = { ...updated[token], value: formatted };
            updated[varDef.writtenVariant] = {
              ...updated[varDef.writtenVariant],
              value: dollarToWritten(value),
            };
          } else {
            // Day/count fields: generate "three (3)" format
            updated[varDef.writtenVariant] = {
              ...updated[varDef.writtenVariant],
              value: numberToWritten(value),
            };
          }
        }

        return updated;
      });
    },
    [docType]
  );

  // Handle clause toggle
  const handleClauseToggle = useCallback((id: string) => {
    setClauses((prev) =>
      prev.map((c) => (c.id === id ? { ...c, included: !c.included } : c))
    );
  }, []);

  // Handle clause text edit
  const handleClauseTextChange = useCallback((id: string, text: string) => {
    setClauses((prev) =>
      prev.map((c) => (c.id === id ? { ...c, text } : c))
    );
  }, []);

  // Handle clause variable edit
  const handleClauseVariableChange = useCallback(
    (id: string, varToken: string, value: string) => {
      setClauses((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;

          const updatedVars = { ...c.variables, [varToken]: value };

          // Re-render clause text with updated variables
          const clauseDef = CLAUSE_LIBRARY.find((def) => def.id === id);
          let text = clauseDef?.template || c.text;
          for (const [vt, vv] of Object.entries(updatedVars)) {
            text = text.replace(
              new RegExp(`\\{\\{${vt}\\}\\}`, "g"),
              vv
            );
          }

          return { ...c, variables: updatedVars, text };
        })
      );
    },
    []
  );

  // Generate document
  const handleGenerate = async () => {
    if (!docType) return;
    setIsGenerating(true);

    try {
      // Build flat variables object (just token → value)
      const flatVars: Record<string, string> = {};
      for (const [token, data] of Object.entries(variables)) {
        flatVars[token] = data.value;
      }

      // Build clauses payload
      const clausePayload = clauses.map((c) => ({
        id: c.id,
        included: c.included,
        variables: c.variables,
        customText: c.source === "ai_drafted" ? c.text : undefined,
      }));

      const res = await fetch("/api/docs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docType: docType.id,
          variables: flatVars,
          clauses: clausePayload,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Generation failed");
      }

      // Get the .docx binary
      const blob = await res.blob();

      // Generate file name: LOI_Building_[Address]_[Date].docx
      const address = (variables.property_address?.value || "Unknown")
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .replace(/\s+/g, "_")
        .substring(0, 50);
      const dateStr = new Date().toISOString().split("T")[0];
      const fileName = `LOI_Building_${address}_${dateStr}.docx`;

      // Store the blob and metadata in sessionStorage for the complete page
      // Convert blob to base64 for storage
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        sessionStorage.setItem(
          `generated_${docType.id}`,
          JSON.stringify({
            fileBase64: base64,
            fileName,
            docType: docType.id,
          })
        );
        router.push(`/docs/${slug}/complete`);
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error("Generation error:", err);
      alert("Error generating document. Please try again.");
      setIsGenerating(false);
    }
  };

  // Guards
  if (!docType) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12 text-center">
        <p className="text-medium-gray">Document type not found.</p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <LoadingSpinner message="Loading review..." />
      </div>
    );
  }

  if (isGenerating) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <LoadingSpinner message="Generating document..." size="lg" />
      </div>
    );
  }

  // Build section-grouped display
  const varMap = getVariableMap(docType.id);
  const sections = getFieldSections(docType.id);
  const writtenTokens = new Set(
    varMap.filter((v) => v.writtenVariant).map((v) => v.writtenVariant!)
  );

  // Collect any tokens not in a section (safety net)
  const sectionedTokens = new Set(sections.flatMap((s) => s.tokens));
  const unsectionedTokens = Object.keys(variables).filter(
    (t) => !sectionedTokens.has(t)
  );

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      {/* Back link */}
      <button
        onClick={() => router.push(`/docs/${slug}`)}
        className="text-medium-gray text-sm hover:text-white transition-colors mb-6 flex items-center gap-1"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 12L6 8L10 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to input
      </button>

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-bebas text-3xl tracking-wide text-white mb-2">
          REVIEW <span className="text-green">TERMS</span>
        </h1>
        <p className="text-medium-gray text-sm">
          Confirm the extracted deal terms. Fields marked with a warning need your attention.
        </p>
      </div>

      {/* Variables grouped by section */}
      <div className="space-y-8 mb-8">
        {sections.map((section) => {
          // Only show sections that have variables with values or are expected
          const sectionVars = section.tokens.filter((t) => variables[t]);
          if (sectionVars.length === 0) return null;

          return (
            <div key={section.title}>
              <h2 className="font-bebas text-lg tracking-wide text-medium-gray mb-3 border-b border-border-gray pb-2">
                {section.title}
              </h2>
              <div className="space-y-4">
                {sectionVars.map((token) => {
                  const variable = variables[token];
                  if (!variable) return null;
                  const isWritten = writtenTokens.has(token);
                  return (
                    <ReviewField
                      key={token}
                      token={token}
                      variable={variable}
                      onChange={handleVariableChange}
                      isWrittenVariant={isWritten}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Any unsectioned fields (safety net) */}
        {unsectionedTokens.length > 0 && (
          <div>
            <h2 className="font-bebas text-lg tracking-wide text-medium-gray mb-3 border-b border-border-gray pb-2">
              Other
            </h2>
            <div className="space-y-4">
              {unsectionedTokens.map((token) => {
                const variable = variables[token];
                if (!variable) return null;
                const isWritten = writtenTokens.has(token);
                return (
                  <ReviewField
                    key={token}
                    token={token}
                    variable={variable}
                    onChange={handleVariableChange}
                    isWrittenVariant={isWritten}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Clauses section (Flexible mode only) */}
      {docType.mode === "flexible" && clauses.length > 0 && (
        <div className="mb-8">
          <h2 className="font-bebas text-xl tracking-wide text-white mb-4">
            OPTIONAL CLAUSES
          </h2>
          <div className="space-y-3">
            {clauses.map((clause) => (
              <ClauseCard
                key={clause.id}
                clause={clause}
                onToggle={handleClauseToggle}
                onTextChange={handleClauseTextChange}
                onVariableChange={handleClauseVariableChange}
              />
            ))}
          </div>
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        className="w-full bg-green text-black font-semibold text-sm py-3 rounded-btn
                   hover:brightness-110 transition-all duration-200
                   flex items-center justify-center gap-2"
      >
        Generate Document
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 12L10 8L6 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
