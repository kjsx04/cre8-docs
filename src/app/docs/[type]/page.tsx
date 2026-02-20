"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { getDocTypeBySlug, CMS_API_BASE } from "@/lib/constants";
import { CmsTeamMember, CmsListing } from "@/lib/types";
import VoiceInput from "@/components/VoiceInput";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function InputPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.type as string;
  const docType = getDocTypeBySlug(slug);

  // Form state
  const [rawInput, setRawInput] = useState("");
  const [sellerBroker, setSellerBroker] = useState("");
  const [cre8Broker, setCre8Broker] = useState("");
  const [selectedListing, setSelectedListing] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // CMS data
  const [teamMembers, setTeamMembers] = useState<CmsTeamMember[]>([]);
  const [listings, setListings] = useState<CmsListing[]>([]);
  const [loadingCms, setLoadingCms] = useState(true);

  // Fetch CMS data on mount
  useEffect(() => {
    async function fetchCmsData() {
      try {
        // Fetch teams and listings in parallel
        const [teamsRes, listingsRes] = await Promise.all([
          fetch(`${CMS_API_BASE}/teams`),
          fetch(`${CMS_API_BASE}/listings`),
        ]);

        if (teamsRes.ok) {
          const teamsData = await teamsRes.json();
          // Extract team member data from Webflow CMS response
          const members: CmsTeamMember[] = (teamsData.items || []).map(
            (item: Record<string, unknown>) => ({
              id: item.id || (item as Record<string, unknown>)._id,
              name: (item as Record<string, Record<string, string>>).fieldData?.name || (item as Record<string, string>).name || "",
              email: (item as Record<string, Record<string, string>>).fieldData?.email || (item as Record<string, string>).email || "",
              phone: (item as Record<string, Record<string, string>>).fieldData?.phone || (item as Record<string, string>).phone || "",
            })
          );
          setTeamMembers(members);
        }

        if (listingsRes.ok) {
          const listingsData = await listingsRes.json();
          const items: CmsListing[] = (listingsData.items || []).map(
            (item: Record<string, unknown>) => ({
              id: item.id || (item as Record<string, unknown>)._id,
              name: (item as Record<string, Record<string, string>>).fieldData?.name || (item as Record<string, string>).name || "",
              address: (item as Record<string, Record<string, string>>).fieldData?.["property-address"] ||
                       (item as Record<string, string>)["property-address"] || "",
              slug: (item as Record<string, Record<string, string>>).fieldData?.slug || (item as Record<string, string>).slug || "",
            })
          );
          setListings(items);
        }
      } catch (err) {
        console.error("Error fetching CMS data:", err);
      } finally {
        setLoadingCms(false);
      }
    }

    fetchCmsData();
  }, []);

  // Handle voice transcription — append to existing text
  const handleTranscript = useCallback((text: string) => {
    setRawInput((prev) => (prev ? prev + " " + text : text));
  }, []);

  // Get selected broker details
  const getSelectedBroker = (id: string) => teamMembers.find((m) => m.id === id);

  // Get selected listing details
  const getSelectedListing = () => listings.find((l) => l.id === selectedListing);

  // Submit to AI extraction
  const handleSubmit = async () => {
    if (!rawInput.trim() || !docType) return;

    setIsSubmitting(true);

    // Build context with CMS selections
    const sellerBrokerData = getSelectedBroker(sellerBroker);
    const cre8BrokerData = getSelectedBroker(cre8Broker);
    const listingData = getSelectedListing();

    try {
      const res = await fetch("/api/docs/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docType: docType.id,
          rawInput,
          cmsContext: {
            sellerBroker: sellerBrokerData || null,
            cre8Broker: cre8BrokerData || null,
            listing: listingData || null,
          },
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Extraction failed");
      }

      const result = await res.json();

      // Store extraction result + CMS context in sessionStorage for the review page
      sessionStorage.setItem(
        `extraction_${docType.id}`,
        JSON.stringify({
          result,
          cmsContext: {
            sellerBroker: sellerBrokerData,
            cre8Broker: cre8BrokerData,
            listing: listingData,
          },
        })
      );

      router.push(`/docs/${slug}/review`);
    } catch (err) {
      console.error("Extraction error:", err);
      alert("Error extracting deal terms. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Guard: invalid doc type
  if (!docType) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12 text-center">
        <p className="text-medium-gray">Document type not found.</p>
        <button
          onClick={() => router.push("/docs")}
          className="mt-4 text-green text-sm hover:underline"
        >
          Back to documents
        </button>
      </div>
    );
  }

  // Loading overlay
  if (isSubmitting) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <LoadingSpinner message="Reading deal terms..." size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      {/* Back link */}
      <button
        onClick={() => router.push("/docs")}
        className="text-medium-gray text-sm hover:text-white transition-colors mb-6 flex items-center gap-1"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 12L6 8L10 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </button>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
            docType.mode === "flexible" ? "bg-green/15 text-green" : "bg-white/10 text-medium-gray"
          }`}>
            {docType.mode === "flexible" ? "Flexible" : "Strict"}
          </span>
        </div>
        <h1 className="font-bebas text-3xl tracking-wide text-white">{docType.name}</h1>
      </div>

      {/* CMS Dropdowns */}
      <div className="space-y-4 mb-6">
        {/* CRE8 Broker (signing agent) */}
        <div>
          <label className="block text-sm font-medium text-white mb-1">
            CRE8 Broker (you)
          </label>
          <select
            value={cre8Broker}
            onChange={(e) => setCre8Broker(e.target.value)}
            className="w-full px-3 py-2 bg-dark-gray border border-border-gray rounded-btn text-sm text-white
                       focus:border-green transition-colors"
          >
            <option value="">Select broker...</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* Seller Broker (counterparty) */}
        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Seller Broker <span className="text-medium-gray font-normal">(optional — or mention in description)</span>
          </label>
          <select
            value={sellerBroker}
            onChange={(e) => setSellerBroker(e.target.value)}
            className="w-full px-3 py-2 bg-dark-gray border border-border-gray rounded-btn text-sm text-white
                       focus:border-green transition-colors"
          >
            <option value="">Select or type in description...</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* Optional CMS Listing (pre-fill address) */}
        <div>
          <label className="block text-sm font-medium text-white mb-1">
            CRE8 Listing <span className="text-medium-gray font-normal">(optional — pre-fills address)</span>
          </label>
          <select
            value={selectedListing}
            onChange={(e) => setSelectedListing(e.target.value)}
            disabled={loadingCms}
            className="w-full px-3 py-2 bg-dark-gray border border-border-gray rounded-btn text-sm text-white
                       focus:border-green transition-colors disabled:opacity-50"
          >
            <option value="">None — I&apos;ll type the address</option>
            {listings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name || l.address}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Text input area */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-white">Deal Description</label>
          <VoiceInput onTranscript={handleTranscript} />
        </div>
        <textarea
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          placeholder="Describe the deal — include property address, buyer, seller, price, and any special terms. You can type or use the voice button above."
          rows={8}
          className="w-full px-4 py-3 bg-dark-gray border border-border-gray rounded-card text-sm text-white
                     placeholder:text-medium-gray focus:border-green transition-colors resize-y leading-relaxed"
        />
        <p className="text-xs text-border-gray mt-1">
          Include as many details as you can. The AI will extract and organize everything.
        </p>
      </div>

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={!rawInput.trim()}
        className="w-full bg-green text-black font-semibold text-sm py-3 rounded-btn
                   hover:brightness-110 transition-all duration-200
                   disabled:opacity-40 disabled:cursor-not-allowed
                   flex items-center justify-center gap-2"
      >
        Extract Deal Terms
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 12L10 8L6 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
