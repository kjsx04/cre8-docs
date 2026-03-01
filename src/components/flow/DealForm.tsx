"use client";

import { Deal, DealFormData, DealDate } from "@/lib/flow/types";

// Stub — full implementation pending
interface DealFormProps {
  deal?: Deal;
  onSave: (data: DealFormData, dealDates?: DealDate[]) => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
  mapboxToken?: string;
}

export default function DealForm({ onCancel }: DealFormProps) {
  return (
    <div className="p-6 text-center text-sm text-[#999]">
      <p>Deal form coming soon.</p>
      <button
        onClick={onCancel}
        className="mt-3 px-4 py-2 border border-[#E5E5E5] rounded-btn text-sm text-[#666] hover:border-[#CCC] transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
