"use client";

import { useState, useEffect, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import DealCard from "@/components/flow/DealCard";
import DealDetail from "@/components/flow/DealDetail";
import DealForm from "@/components/flow/DealForm";
import { Deal, DealFormData, DealStatus, BrokerDefaults, DealDate, Broker } from "@/lib/flow/types";
import {
  formatCurrency,
  calcCommission,
  calcMemberTakeHome,
  getMemberSplit,
  getNextCriticalDate,
  countdownText,
} from "@/lib/flow/utils";

// Tab options for filtering deals
const TABS: { label: string; statuses: DealStatus[] }[] = [
  { label: "Active", statuses: ["active", "due_diligence", "closing"] },
  { label: "Closed", statuses: ["closed"] },
  { label: "Cancelled", statuses: ["cancelled"] },
];

export default function FlowPage() {
  const { accounts } = useMsal();
  const userEmail = accounts[0]?.username || "";

  const [deals, setDeals] = useState<Deal[]>([]);
  const [brokerDefaults, setBrokerDefaults] = useState<BrokerDefaults | null>(null);
  const [brokerId, setBrokerId] = useState<string>("");          // logged-in broker's UUID
  const [allBrokers, setAllBrokers] = useState<Pick<Broker, "id" | "name" | "email">[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch deals + broker defaults from API
  const fetchDeals = useCallback(async () => {
    if (!userEmail) return;
    try {
      const res = await fetch("/api/flow/deals", {
        headers: { "x-user-email": userEmail },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load deals");
      }
      const data = await res.json();
      // Shape: { deals, broker_defaults, broker_id, all_brokers }
      setDeals(data.deals || []);
      setBrokerDefaults(data.broker_defaults || null);
      setBrokerId(data.broker_id || "");
      setAllBrokers(data.all_brokers || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load deals");
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  // Create a new deal (includes deal_dates as a separate array)
  const handleCreate = async (data: DealFormData, dealDates?: DealDate[]) => {
    setSaving(true);
    try {
      const res = await fetch("/api/flow/deals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": userEmail,
        },
        body: JSON.stringify({
          ...data,
          deal_dates: dealDates || [],
        }),
      });
      if (!res.ok) throw new Error("Failed to create deal");
      setShowNewForm(false);
      await fetchDeals();
    } catch (e) {
      console.error("Create failed:", e);
    } finally {
      setSaving(false);
    }
  };

  // Update a deal (from DealDetail — edit, close, cancel, notes)
  const handleUpdate = async (id: string, data: Partial<Deal> | DealFormData, dealDates?: DealDate[]) => {
    try {
      const payload: Record<string, unknown> = { ...data };
      if (dealDates !== undefined) {
        payload.deal_dates = dealDates;
      }
      const res = await fetch(`/api/flow/deals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update deal");
      await fetchDeals();
      // Refresh the selected deal if it's the one we updated
      if (selectedDeal?.id === id) {
        const updated = await res.json();
        setSelectedDeal(updated);
      }
    } catch (e) {
      console.error("Update failed:", e);
    }
  };

  // Filter deals by active tab
  const filteredDeals = deals.filter((d) => TABS[activeTab].statuses.includes(d.status));

  // Sort active deals by nearest critical date (most urgent first)
  const sortedDeals = [...filteredDeals].sort((a, b) => {
    if (activeTab === 0) {
      // Active tab — sort by nearest upcoming date
      const nextA = getNextCriticalDate(a);
      const nextB = getNextCriticalDate(b);
      if (!nextA && !nextB) return 0;
      if (!nextA) return 1;
      if (!nextB) return -1;
      return nextA.daysAway - nextB.daysAway;
    }
    // Closed/Cancelled — newest first (by updated_at)
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  // Summary stats (active deals only) — uses member-specific take-home for logged-in broker
  const activeDeals = deals.filter((d) => ["active", "due_diligence", "closing"].includes(d.status));
  const totalPipeline = activeDeals.reduce((sum, d) => sum + (d.price || 0), 0);
  const totalCommission = activeDeals.reduce((sum, d) => sum + calcCommission(d.price, d.commission_rate), 0);
  const totalTakeHome = activeDeals.reduce((sum, d) => {
    const memberSplit = getMemberSplit(d.deal_members, brokerId);
    return sum + calcMemberTakeHome(d.price, d.commission_rate, d.broker_split, d.additional_splits || [], memberSplit);
  }, 0);

  // Next urgent date across all active deals
  const urgentDate = activeDeals
    .map((d) => ({ deal: d, next: getNextCriticalDate(d) }))
    .filter((x) => x.next && !x.next.isPast)
    .sort((a, b) => a.next!.daysAway - b.next!.daysAway)[0];

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto">
      {/* Summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Active Deals" value={String(activeDeals.length)} />
        <SummaryCard label="Pipeline Value" value={formatCurrency(totalPipeline)} />
        <SummaryCard label="Total Commission" value={formatCurrency(totalCommission)} />
        <SummaryCard label="Total Take-Home" value={formatCurrency(totalTakeHome)} accent />
      </div>

      {/* Urgent date alert */}
      {urgentDate && urgentDate.next && urgentDate.next.urgency !== "green" && urgentDate.next.urgency !== "gray" && (
        <div className={`mb-4 p-3 rounded-btn border text-sm flex items-center gap-2
          ${urgentDate.next.urgency === "red"
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-amber-50 border-amber-200 text-amber-700"}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>
            <strong>{urgentDate.deal.deal_name}</strong> — {urgentDate.next.label} in {countdownText(urgentDate.next.daysAway)}
          </span>
        </div>
      )}

      {/* Tab bar + New Deal button */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {TABS.map((tab, i) => {
            const count = deals.filter((d) => tab.statuses.includes(d.status)).length;
            return (
              <button
                key={tab.label}
                onClick={() => setActiveTab(i)}
                className={`px-4 py-2 text-sm font-medium rounded-btn transition-colors duration-200
                  ${activeTab === i
                    ? "bg-green text-white"
                    : "text-medium-gray hover:text-charcoal hover:bg-light-gray"}`}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="px-4 py-2 text-sm font-semibold bg-green text-white rounded-btn
                     hover:bg-green/90 transition-colors duration-200 flex items-center gap-1"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Deal
        </button>
      </div>

      {/* Deal cards */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <p className="text-red-600 text-sm mb-2">{error}</p>
          <button onClick={fetchDeals} className="text-sm text-green hover:underline">Retry</button>
        </div>
      ) : sortedDeals.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-gray text-sm">
            {activeTab === 0 ? "No active deals. Create one to get started." : `No ${TABS[activeTab].label.toLowerCase()} deals.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortedDeals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              brokerId={brokerId}
              onClick={() => setSelectedDeal(deal)}
            />
          ))}
        </div>
      )}

      {/* Deal detail slide-over */}
      {selectedDeal && (
        <DealDetail
          deal={selectedDeal}
          brokerId={brokerId}
          onUpdate={handleUpdate}
          onClose={() => setSelectedDeal(null)}
        />
      )}

      {/* New deal form — pre-fill commission from broker defaults */}
      {showNewForm && (
        <DealForm
          onSave={handleCreate}
          onCancel={() => setShowNewForm(false)}
          saving={saving}
          mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
          brokerDefaults={brokerDefaults || undefined}
          userEmail={userEmail}
          brokerId={brokerId}
          allBrokers={allBrokers}
        />
      )}
    </div>
  );
}

// Small summary stat card
function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white border border-border-light rounded-card p-4">
      <p className="text-xs text-muted-gray mb-1">{label}</p>
      <p className={`text-lg font-bold ${accent ? "text-green" : "text-charcoal"}`}>{value}</p>
    </div>
  );
}
