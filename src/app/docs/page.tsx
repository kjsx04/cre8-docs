"use client";

import DocTypeCard from "@/components/DocTypeCard";
import { DOC_TYPES } from "@/lib/constants";

export default function DocsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-bebas text-4xl tracking-wide text-white mb-2">
          NEW <span className="text-green">DOCUMENT</span>
        </h1>
        <p className="text-medium-gray text-sm">
          Select a document type to get started. Describe the deal and AI will
          extract the terms.
        </p>
      </div>

      {/* Document type cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {DOC_TYPES.map((docType) => (
          <DocTypeCard key={docType.id} docType={docType} />
        ))}
      </div>
    </div>
  );
}
