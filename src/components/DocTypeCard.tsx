"use client";

import { DocType } from "@/lib/types";
import { useRouter } from "next/navigation";

interface DocTypeCardProps {
  docType: DocType;
}

export default function DocTypeCard({ docType }: DocTypeCardProps) {
  const router = useRouter();

  const handleClick = () => {
    if (!docType.enabled) return;
    router.push(`/docs/${docType.slug}`);
  };

  return (
    <button
      onClick={handleClick}
      disabled={!docType.enabled}
      className={`text-left w-full p-6 rounded-card border transition-all duration-200
        ${
          docType.enabled
            ? "bg-dark-gray border-border-gray hover:border-green cursor-pointer"
            : "bg-charcoal border-border-gray opacity-50 cursor-not-allowed"
        }`}
    >
      {/* Mode badge + Coming Soon */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded ${
            docType.mode === "flexible"
              ? "bg-green/15 text-green"
              : "bg-white/10 text-medium-gray"
          }`}
        >
          {docType.mode === "flexible" ? "Flexible" : "Strict"}
        </span>
        {!docType.enabled && (
          <span className="text-xs text-medium-gray">Coming Soon</span>
        )}
      </div>

      {/* Name */}
      <h3 className="text-white font-semibold text-lg mb-1">{docType.name}</h3>

      {/* Description */}
      <p className="text-medium-gray text-sm">{docType.description}</p>

      {/* Arrow indicator for enabled cards */}
      {docType.enabled && (
        <div className="mt-4 text-green text-sm font-semibold flex items-center gap-1">
          Start
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="mt-px"
          >
            <path
              d="M6 12L10 8L6 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </button>
  );
}
