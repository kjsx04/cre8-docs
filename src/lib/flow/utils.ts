import { Deal, CriticalDate, AdditionalSplit, DealMember } from "./types";

// ── Date helpers ──

/** Add days to a date, returns new Date */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Days between two dates (positive = future, negative = past) */
export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/** Format date as "Mar 15, 2026" */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00"); // force local timezone
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Format date as "YYYY-MM-DD" for form inputs */
export function toInputDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return dateStr.substring(0, 10);
}

// ── Currency + percent formatting ──

/** Format number as "$1,234,567" */
export function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** Format decimal as "3%" (0.03 → "3%") */
export function formatPercent(value: number): string {
  return (value * 100).toFixed(1).replace(/\.0$/, "") + "%";
}

// ── Commission calculations ──

/** Total commission = price × rate */
export function calcCommission(price: number | null, rate: number): number {
  if (!price) return 0;
  return price * rate;
}

/** Broker's split = commission × split rate */
export function calcBrokerSplit(price: number | null, rate: number, split: number): number {
  return calcCommission(price, rate) * split;
}

/** After house = broker split × 0.70 (house takes 30%) */
export function calcAfterHouse(price: number | null, rate: number, split: number): number {
  return calcBrokerSplit(price, rate, split) * 0.70;
}

/** Sum of deductions = afterHouse × each additional split percent */
export function calcDeductions(afterHouse: number, splits: AdditionalSplit[]): number {
  return splits.reduce((sum, s) => sum + afterHouse * s.percent, 0);
}

/** Take-home = after house − all additional split deductions */
export function calcTakeHome(
  price: number | null,
  rate: number,
  split: number,
  additionalSplits: AdditionalSplit[] = []
): number {
  const afterHouse = calcAfterHouse(price, rate, split);
  return afterHouse - calcDeductions(afterHouse, additionalSplits);
}

/**
 * Calculate a single member's take-home from a deal.
 * memberSplit: the member's share of the broker side (decimal, e.g. 0.50 = 50%).
 * If null, returns the full deal take-home (for backward compat / solo deals).
 */
export function calcMemberTakeHome(
  price: number | null,
  rate: number,
  brokerSplit: number,
  additionalSplits: AdditionalSplit[] = [],
  memberSplit: number | null = null
): number {
  const afterHouse = calcAfterHouse(price, rate, brokerSplit);
  // Apply the member's share of the broker side first
  const memberShare = memberSplit !== null ? afterHouse * memberSplit : afterHouse;
  // Then subtract the member's portion of additional splits (referral fees, etc.)
  const deductions = additionalSplits.reduce((sum, s) => sum + memberShare * s.percent, 0);
  return memberShare - deductions;
}

/**
 * Get the effective split for a specific broker from a deal's member list.
 * Returns the decimal split (e.g. 0.50 for 50%). If broker not found, returns 1 (full share).
 */
export function getMemberSplit(members: DealMember[] | undefined, brokerId: string): number {
  if (!members || members.length === 0) return 1;
  const member = members.find((m) => m.broker_id === brokerId);
  if (!member) return 1;
  // If split_percent is null, it's an even split across all members
  if (member.split_percent === null) return 1 / members.length;
  return member.split_percent;
}

// ── Critical dates from dynamic deal_dates ──

/**
 * Build CriticalDate array from deal.deal_dates (dynamic rows from deal_dates table).
 * Falls back to legacy computed dates if deal_dates isn't populated.
 */
export function getCriticalDates(deal: Deal): CriticalDate[] {
  const dates: CriticalDate[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Helper to add a date entry
  const add = (label: string, date: Date | null) => {
    if (!date) return;
    const daysAway = daysBetween(today, date);
    const isPast = daysAway < 0;
    // Color coding: gray if past, red ≤3 days, yellow 4-14 days, green 15+ days
    let urgency: "green" | "yellow" | "red" | "gray" = "green";
    if (isPast) urgency = "gray";
    else if (daysAway <= 3) urgency = "red";
    else if (daysAway <= 14) urgency = "yellow";
    dates.push({ label, date, isPast, daysAway, urgency });
  };

  // Always show escrow open as first entry if set
  if (deal.escrow_open_date) {
    add("Escrow Open", new Date(deal.escrow_open_date + "T00:00:00"));
  }

  // Use dynamic deal_dates if available
  if (deal.deal_dates && deal.deal_dates.length > 0) {
    // Sort by sort_order, then by date
    const sorted = [...deal.deal_dates].sort((a, b) => a.sort_order - b.sort_order);
    for (const dd of sorted) {
      add(dd.label, new Date(dd.date + "T00:00:00"));
    }
  } else {
    // Legacy fallback — compute from old day-count fields
    if (deal.escrow_open_date && deal.feasibility_days) {
      const escrowOpen = new Date(deal.escrow_open_date + "T00:00:00");
      const feasEnd = addDays(escrowOpen, deal.feasibility_days);
      add("Feasibility Ends", feasEnd);

      if (deal.dd_extension_date) {
        add("DD Extension", new Date(deal.dd_extension_date + "T00:00:00"));
      }

      if (deal.inside_close_days) {
        const insideClose = addDays(feasEnd, deal.inside_close_days);
        add("Inside Close", insideClose);

        if (deal.outside_close_days) {
          add("Outside Close", addDays(insideClose, deal.outside_close_days));
        }
      }
    } else if (deal.dd_extension_date) {
      add("DD Extension", new Date(deal.dd_extension_date + "T00:00:00"));
    }
  }

  return dates;
}

/** Get the next upcoming critical date (soonest future date) */
export function getNextCriticalDate(deal: Deal): CriticalDate | null {
  const dates = getCriticalDates(deal);
  // Find the nearest future date, or the most recently passed one if all are past
  const future = dates.filter(d => !d.isPast).sort((a, b) => a.daysAway - b.daysAway);
  if (future.length > 0) return future[0];
  // All dates past — return the most recent one
  const past = dates.filter(d => d.isPast).sort((a, b) => b.daysAway - a.daysAway);
  return past[0] || null;
}

// ── Countdown display text ──

export function countdownText(daysAway: number): string {
  if (daysAway === 0) return "Today";
  if (daysAway === 1) return "Tomorrow";
  if (daysAway === -1) return "1 day ago";
  if (daysAway < 0) return `${Math.abs(daysAway)} days ago`;
  return `${daysAway} days`;
}

// ── Status display helpers ──

export const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  due_diligence: "Due Diligence",
  closing: "Closing",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const STATUS_COLORS: Record<string, string> = {
  active: "bg-green/10 text-green border-green/30",
  due_diligence: "bg-amber-50 text-amber-700 border-amber-200",
  closing: "bg-amber-50 text-amber-700 border-amber-200",
  closed: "bg-charcoal/5 text-charcoal border-charcoal/20",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};
