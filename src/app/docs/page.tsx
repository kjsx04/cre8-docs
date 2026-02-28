"use client";

import { DOC_TYPES } from "@/lib/constants";
import { useRouter } from "next/navigation";

/* Group doc types into categories for Finder-style display */
const CATEGORIES = [
  {
    label: "LOI",
    items: [
      { slug: "loi-building", name: "Building Purchase" },
      { slug: "loi-land", name: "Land Purchase" },
      { slug: "loi-lease", name: "Lease" },
    ],
  },
  {
    label: "Listing Agreement",
    items: [
      { slug: "listing-sale", name: "Sale" },
      { slug: "listing-lease", name: "Lease" },
    ],
  },
];

export default function DocsPage() {
  const router = useRouter();

  /* Look up enabled status from DOC_TYPES */
  const isEnabled = (slug: string) =>
    DOC_TYPES.find((d) => d.slug === slug)?.enabled ?? false;

  const handleClick = (slug: string) => {
    if (!isEnabled(slug)) return;
    router.push(`/docs/${slug}/complete`);
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-10 text-center">
        <h1 className="font-bebas text-4xl tracking-wide text-white mb-2">
          CREATE <span className="text-green">DOCUMENT</span>
        </h1>
        <p className="text-medium-gray text-sm">
          Select a document type to get started.
        </p>
      </div>

      {/* Finder-style grouped list */}
      <div className="flex flex-col gap-6">
        {CATEGORIES.map((cat) => (
          <div key={cat.label}>
            {/* Category heading */}
            <h2 className="text-xs font-semibold uppercase tracking-widest text-medium-gray mb-2 px-1">
              {cat.label}
            </h2>

            {/* List of items inside a rounded container */}
            <div className="rounded-lg border border-border-gray overflow-hidden">
              {cat.items.map((item, i) => {
                const enabled = isEnabled(item.slug);
                return (
                  <button
                    key={item.slug}
                    onClick={() => handleClick(item.slug)}
                    disabled={!enabled}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors duration-150
                      ${enabled ? "hover:bg-dark-gray cursor-pointer" : "opacity-40 cursor-not-allowed"}
                      ${i > 0 ? "border-t border-border-gray" : ""}`}
                  >
                    <span className="text-white text-sm font-medium">
                      {item.name}
                    </span>
                    <div className="flex items-center gap-2">
                      {/* "Coming Soon" badge for disabled items */}
                      {!enabled && (
                        <span className="text-[10px] text-medium-gray uppercase tracking-wide">
                          Coming Soon
                        </span>
                      )}
                      {/* Chevron */}
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        className={enabled ? "text-medium-gray" : "text-border-gray"}
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
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
