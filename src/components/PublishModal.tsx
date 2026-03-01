"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import SparkMD5 from "spark-md5";
import type { PackageAssets } from "@/components/PackageUploader";
import type { ListingFieldData } from "@/lib/admin-constants";

/* ============================================================
   TYPES
   ============================================================ */
interface PublishModalProps {
  /** CMS field data (text, toggles, etc) — everything except asset URLs */
  fieldData: ListingFieldData;
  /** Existing Webflow item ID (edit mode) or null (new) */
  itemId: string | null;
  /** Package assets (PDF, gallery images, marketing index) */
  packageAssets: PackageAssets;
  /** Alta survey file (null if unchanged) */
  altaFile: File | null;
  /** Site plan file (null if unchanged) */
  sitePlanFile: File | null;
  /** Listing slug — used as asset folder name */
  slug: string;
  /** Listing name — used for alt text */
  listingName: string;
  /** Existing asset URLs from Webflow (edit mode fallbacks) */
  existingUrls: {
    package?: string;
    alta?: string;
    sitePlan?: string;
    floorplan?: string;
    gallery?: string[];
  };
  /** Called when publish completes successfully */
  onComplete: (newItemId: string) => void;
  /** Called when modal is closed */
  onClose: () => void;
}

/** Step status for the progress display */
type StepStatus = "waiting" | "active" | "done" | "skipped" | "error";

interface StepState {
  label: string;
  status: StepStatus;
  detail?: string;
}

/* ============================================================
   HELPERS
   ============================================================ */

/** Compute MD5 hash of a blob using SparkMD5 */
function md5Hash(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const spark = new SparkMD5.ArrayBuffer();
      spark.append(reader.result as ArrayBuffer);
      resolve(spark.end());
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

/** Upload a single asset: get presigned URL from our API, then upload to S3 */
async function uploadAsset(
  blob: Blob,
  fileName: string,
  folderId: string
): Promise<{ id: string; hostedUrl: string }> {
  // 1. Compute MD5 hash
  const hash = await md5Hash(blob);

  // 2. Get presigned URL from our API → Worker → Webflow
  const metaRes = await fetch("/api/assets/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, fileHash: hash, parentFolder: folderId }),
  });

  if (!metaRes.ok) {
    const text = await metaRes.text();
    throw new Error(`Asset meta failed ${metaRes.status}: ${text}`);
  }

  const meta = await metaRes.json();
  if (!meta.uploadUrl || !meta.uploadDetails) {
    throw new Error("No upload URL from Webflow");
  }

  // 3. Upload directly to S3 using presigned form fields
  const form = new FormData();
  const d = meta.uploadDetails;
  const s3Fields = [
    "acl", "bucket", "X-Amz-Algorithm", "X-Amz-Credential", "X-Amz-Date",
    "key", "Policy", "X-Amz-Signature", "success_action_status",
    "content-type", "Cache-Control",
  ];
  for (const k of s3Fields) {
    if (d[k] != null) form.append(k, d[k]);
  }
  form.append("file", blob, fileName);

  const s3Res = await fetch(meta.uploadUrl, { method: "POST", body: form });
  if (!s3Res.ok && s3Res.status !== 201) {
    throw new Error(`S3 upload failed: ${s3Res.status}`);
  }

  return { id: meta.id, hostedUrl: meta.hostedUrl };
}

/* ============================================================
   COMPONENT
   ============================================================ */
export default function PublishModal({
  fieldData,
  itemId,
  packageAssets,
  altaFile,
  sitePlanFile,
  slug,
  listingName,
  existingUrls,
  onComplete,
  onClose,
}: PublishModalProps) {
  // ---- Step definitions ----
  const initialSteps: StepState[] = [
    { label: "Create asset folder", status: "waiting" },
    { label: "Upload package PDF", status: "waiting" },
    { label: "Upload gallery images", status: "waiting" },
    { label: "Upload alta survey", status: "waiting" },
    { label: "Upload site plan", status: "waiting" },
    { label: "Processing assets", status: "waiting" },
    { label: "Save listing to CMS", status: "waiting" },
    { label: "Publish to live site", status: "waiting" },
  ];

  const [steps, setSteps] = useState<StepState[]>(initialSteps);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  // Helper to update a single step
  const updateStep = useCallback(
    (idx: number, status: StepStatus, detail?: string) => {
      setSteps((prev) =>
        prev.map((s, i) => (i === idx ? { ...s, status, detail } : s))
      );
    },
    []
  );

  // ---- Main publish flow ----
  const runPublish = useCallback(async () => {
    setRunning(true);
    setError(null);
    abortRef.current = false;

    // Collect asset URLs — start with existing fallbacks
    const urls = {
      marketing: existingUrls.floorplan || null,
      gallery: [...(existingUrls.gallery || [])],
      packagePdf: existingUrls.package || null,
      alta: existingUrls.alta || null,
      sitePlan: existingUrls.sitePlan || null,
    };

    let folderId = "";

    try {
      /* ---- STEP 0: Create asset folder ---- */
      // Only needed if we have new files to upload
      const hasNewFiles =
        packageAssets.packageFile ||
        packageAssets.galleryImages.some((img) => img.blob) ||
        altaFile ||
        sitePlanFile;

      if (hasNewFiles) {
        updateStep(0, "active");
        const folderRes = await fetch("/api/assets/folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: slug }),
        });
        if (!folderRes.ok) throw new Error("Failed to create asset folder");
        const folderData = await folderRes.json();
        folderId = folderData.id;
        updateStep(0, "done");
      } else {
        updateStep(0, "skipped", "No new files");
      }

      if (abortRef.current) return;

      /* ---- STEP 1: Upload package PDF ---- */
      if (packageAssets.packageFile) {
        updateStep(1, "active");
        const result = await uploadAsset(
          packageAssets.packageFile,
          `${slug}-package.pdf`,
          folderId
        );
        urls.packagePdf = result.hostedUrl;
        updateStep(1, "done");
      } else {
        updateStep(1, "skipped", urls.packagePdf ? "Using existing" : "None");
      }

      if (abortRef.current) return;

      /* ---- STEP 2: Upload gallery images ---- */
      const newGalleryImages = packageAssets.galleryImages.filter(
        (img) => img.blob
      );
      if (newGalleryImages.length > 0) {
        updateStep(2, "active", `0 / ${newGalleryImages.length}`);

        // Reset gallery URLs — we'll rebuild from scratch
        urls.gallery = [];
        urls.marketing = null;

        for (let i = 0; i < packageAssets.galleryImages.length; i++) {
          const img = packageAssets.galleryImages[i];

          if (img.blob) {
            // New image — upload it
            updateStep(2, "active", `${urls.gallery.length + 1} / ${packageAssets.galleryImages.length}`);
            const result = await uploadAsset(img.blob, img.name, folderId);
            urls.gallery.push(result.hostedUrl);

            // Track marketing image
            if (i === packageAssets.marketingIdx) {
              urls.marketing = result.hostedUrl;
            }
          } else if (img.isExisting && img.url) {
            // Existing image — keep URL
            urls.gallery.push(img.url);
            if (i === packageAssets.marketingIdx) {
              urls.marketing = img.url;
            }
          }

          if (abortRef.current) return;
        }

        updateStep(2, "done", `${urls.gallery.length} images`);
      } else if (packageAssets.galleryImages.length > 0) {
        // All existing images — keep current URLs
        urls.gallery = packageAssets.galleryImages
          .filter((img) => img.url)
          .map((img) => img.url);
        if (packageAssets.galleryImages[packageAssets.marketingIdx]?.url) {
          urls.marketing =
            packageAssets.galleryImages[packageAssets.marketingIdx].url;
        }
        updateStep(2, "skipped", "Using existing");
      } else {
        updateStep(2, "skipped", "No images");
      }

      if (abortRef.current) return;

      /* ---- STEP 3: Upload alta survey ---- */
      if (altaFile) {
        updateStep(3, "active");
        const result = await uploadAsset(
          altaFile,
          `${slug}-alta-survey.pdf`,
          folderId
        );
        urls.alta = result.hostedUrl;
        updateStep(3, "done");
      } else {
        updateStep(3, "skipped", urls.alta ? "Using existing" : "None");
      }

      if (abortRef.current) return;

      /* ---- STEP 4: Upload site plan ---- */
      if (sitePlanFile) {
        updateStep(4, "active");
        const result = await uploadAsset(
          sitePlanFile,
          `${slug}-site-plan.pdf`,
          folderId
        );
        urls.sitePlan = result.hostedUrl;
        updateStep(4, "done");
      } else {
        updateStep(4, "skipped", urls.sitePlan ? "Using existing" : "None");
      }

      if (abortRef.current) return;

      /* ---- STEP 5: Wait for Webflow processing ---- */
      if (hasNewFiles) {
        updateStep(5, "active", "2.5s delay");
        await new Promise((resolve) => setTimeout(resolve, 2500));
        updateStep(5, "done");
      } else {
        updateStep(5, "skipped");
      }

      if (abortRef.current) return;

      /* ---- STEP 6: Create/Update CMS item ---- */
      updateStep(6, "active");

      // Build full payload with asset URLs
      const fullFieldData: Record<string, unknown> = { ...fieldData };

      // Image fields
      if (urls.marketing) {
        fullFieldData.floorplan = {
          url: urls.marketing,
          alt: `${listingName} Marketing Picture`,
        };
      }
      if (urls.gallery.length > 0) {
        fullFieldData.gallery = urls.gallery.map((u, i) => ({
          url: u,
          alt: `${listingName} - Image ${i + 1}`,
        }));
      }

      // File fields (plain URLs)
      if (urls.packagePdf) fullFieldData["package-2"] = urls.packagePdf;
      if (urls.alta) fullFieldData["alta-survey-2"] = urls.alta;
      if (urls.sitePlan) fullFieldData["site-plan-2"] = urls.sitePlan;

      let cmsItemId = itemId;

      if (itemId) {
        // Edit mode — PATCH existing item and mark as not draft
        const res = await fetch(`/api/listings/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isArchived: false,
            isDraft: false,
            fieldData: fullFieldData,
          }),
        });
        if (!res.ok) throw new Error(`CMS update failed: ${res.status}`);
      } else {
        // New listing — POST
        const res = await fetch("/api/listings/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isArchived: false,
            isDraft: false,
            fieldData: fullFieldData,
          }),
        });
        if (!res.ok) throw new Error(`CMS create failed: ${res.status}`);
        const data = await res.json();
        cmsItemId = data.id;
      }

      updateStep(6, "done");

      if (abortRef.current || !cmsItemId) return;

      /* ---- STEP 7: Publish ---- */
      updateStep(7, "active");
      const pubRes = await fetch("/api/listings/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: [cmsItemId] }),
      });
      if (!pubRes.ok) throw new Error(`Publish failed: ${pubRes.status}`);
      updateStep(7, "done");

      setFinished(true);
      onComplete(cmsItemId);
    } catch (err) {
      if (abortRef.current) return;
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);

      // Mark the currently active step as error
      setSteps((prev) =>
        prev.map((s) => (s.status === "active" ? { ...s, status: "error" } : s))
      );
    } finally {
      setRunning(false);
    }
  }, [
    fieldData, itemId, packageAssets, altaFile, sitePlanFile,
    slug, listingName, existingUrls, updateStep, onComplete,
  ]);

  // Auto-start on mount
  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      runPublish();
    }
  }, [runPublish]);

  // ---- Render ----
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={!running ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative w-full max-w-[480px] mx-4 bg-white rounded-card shadow-xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#F0F0F0]">
          <h2 className="text-base font-bold text-[#1a1a1a]">
            {finished
              ? "Published Successfully"
              : error
                ? "Publish Failed"
                : "Publishing Listing..."}
          </h2>
        </div>

        {/* Steps */}
        <div className="px-6 py-4 space-y-3">
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-center gap-3">
              {/* Status icon */}
              <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                {step.status === "done" && (
                  <span className="text-[#4A8C1C] text-base">&#10003;</span>
                )}
                {step.status === "active" && (
                  <span className="w-4 h-4 border-2 border-[#8CC644] border-t-transparent rounded-full animate-spin" />
                )}
                {step.status === "waiting" && (
                  <span className="w-2 h-2 rounded-full bg-[#DDD]" />
                )}
                {step.status === "skipped" && (
                  <span className="text-[#CCC] text-sm">&#8212;</span>
                )}
                {step.status === "error" && (
                  <span className="text-[#CC3333] text-base">&#10005;</span>
                )}
              </div>

              {/* Label + detail */}
              <div className="flex-1 min-w-0">
                <span
                  className={`text-sm ${
                    step.status === "active"
                      ? "text-[#333] font-medium"
                      : step.status === "done"
                        ? "text-[#4A8C1C]"
                        : step.status === "error"
                          ? "text-[#CC3333]"
                          : step.status === "skipped"
                            ? "text-[#BBB]"
                            : "text-[#999]"
                  }`}
                >
                  {step.label}
                </span>
                {step.detail && (
                  <span className="text-[11px] text-[#999] ml-2">
                    {step.detail}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-6 mb-4 px-3 py-2 bg-[#FFF5F5] border border-[#FFCCCC] rounded-btn">
            <p className="text-xs text-[#CC3333]">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#F0F0F0] flex justify-end gap-3">
          {error && (
            <button
              onClick={() => {
                // Reset and retry
                setSteps(initialSteps);
                setError(null);
                started.current = false;
                setTimeout(() => {
                  started.current = true;
                  runPublish();
                }, 0);
              }}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#1a1a1a] rounded-btn
                         hover:bg-[#333] transition-colors"
            >
              Retry
            </button>
          )}
          <button
            onClick={() => {
              abortRef.current = true;
              onClose();
            }}
            className={`px-4 py-2 text-sm font-semibold rounded-btn transition-colors ${
              finished
                ? "bg-[#8CC644] text-white hover:bg-[#7AB800]"
                : "border border-[#E5E5E5] text-[#666] hover:border-[#CCC]"
            }`}
          >
            {finished ? "Done" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
