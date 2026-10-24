/**
 * Purchase details as plain functions (no database, no request). Source: docs/PLAN-v2.md A5.
 *
 * A purchase records the supplier's invoice (number and date), the truck, the bags billed and the
 * bags that really arrived, and the freight + unloading we paid:
 * - Stock: the purchase adds the BILLED bags; short bags (never arrived) and burst bags (arrived,
 *   unsaleable) are taken out again by linked adjustments (transit_short / transit_burst).
 *   Received = billed − short − burst, and must be at least 1.
 * - The supplier is owed billed × cost per bag, dated on the invoice date. Short / burst bags are a
 *   claim against the supplier (bags × cost per bag), followed by a claim status.
 * - Freight and unloading never go to the supplier or a shop: they only raise the landed cost per
 *   good bag (`landedUnitCostPaise` in money.ts), which the profit report uses.
 *
 * This file is also read by drizzle-kit (the schema uses CLAIM_STATUSES), so it imports only
 * plain relative files (no "@/" paths).
 */
import { landedUnitCostPaise } from "./money";
import { checkCostPerBag, checkEntryDate } from "./supplier-rules";

export const MAX_INVOICE_NO = 60;
/** Largest billed bags on one invoice (a typo guard). */
export const MAX_PURCHASE_BAGS = 999_999;
/** Largest freight or unloading on one purchase: ₹5,00,000 each (a typo guard). */
export const MAX_PURCHASE_EXTRA_PAISE = 5_00_000 * 100;

export const CLAIM_STATUSES = ["none", "open", "claimed", "credited"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_LABELS: Record<ClaimStatus, string> = {
  none: "No claim",
  open: "Claim open",
  claimed: "Claimed",
  credited: "Credited",
};

export function isClaimStatus(value: unknown): value is ClaimStatus {
  return typeof value === "string" && (CLAIM_STATUSES as readonly string[]).includes(value);
}

export type PurchaseDetails = {
  invoiceNo: string;
  /** "YYYY-MM-DD" (India). The supplier entry is dated on it. */
  invoiceDate: string;
  billedBags: number;
  shortBags: number;
  burstBags: number;
  receivedBags: number;
  freightPaise: number;
  unloadingPaise: number;
  landedUnitCostPaise: number;
  claimStatus: "none" | "open";
};

/** A whole number >= 0; empty (undefined, null, "") counts as 0. Null when not valid. */
function wholeOrZero(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return 0;
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
}

/** The invoice, bags and extras of one purchase, checked, with the received bags and landed cost worked out. */
export function checkPurchaseDetails(
  raw: {
    invoiceNo?: unknown;
    invoiceDate?: unknown;
    billedBags?: unknown;
    shortBags?: unknown;
    burstBags?: unknown;
    freightPaise?: unknown;
    unloadingPaise?: unknown;
    costPerBagPaise?: unknown;
  },
  today: string,
): { ok: true; value: PurchaseDetails } | { ok: false; error: string } {
  const invoiceNo = typeof raw.invoiceNo === "string" ? raw.invoiceNo.trim() : "";
  if (!invoiceNo) return { ok: false, error: "Enter the invoice no." };
  if (invoiceNo.length > MAX_INVOICE_NO) return { ok: false, error: "That invoice no. is too long." };
  const date = checkEntryDate(raw.invoiceDate, today);
  if (!date.ok) return date;
  const billed = raw.billedBags;
  if (typeof billed !== "number" || !Number.isSafeInteger(billed) || billed < 1) return { ok: false, error: "Enter the bags." };
  if (billed > MAX_PURCHASE_BAGS) return { ok: false, error: "That is too many bags." };
  const shortBags = wholeOrZero(raw.shortBags);
  const burstBags = wholeOrZero(raw.burstBags);
  if (shortBags === null || burstBags === null) return { ok: false, error: "Enter whole bags for short and burst." };
  if (shortBags + burstBags >= billed) return { ok: false, error: "Received bags must be more than 0." };
  const freightPaise = wholeOrZero(raw.freightPaise);
  const unloadingPaise = wholeOrZero(raw.unloadingPaise);
  if (freightPaise === null) return { ok: false, error: "Enter the freight in rupees." };
  if (unloadingPaise === null) return { ok: false, error: "Enter the unloading in rupees." };
  if (freightPaise > MAX_PURCHASE_EXTRA_PAISE) return { ok: false, error: "That freight is too high." };
  if (unloadingPaise > MAX_PURCHASE_EXTRA_PAISE) return { ok: false, error: "That unloading is too high." };
  const cost = checkCostPerBag(raw.costPerBagPaise);
  if (!cost.ok) return cost;
  const receivedBags = billed - shortBags - burstBags;
  return {
    ok: true,
    value: {
      invoiceNo,
      invoiceDate: date.date,
      billedBags: billed,
      shortBags,
      burstBags,
      receivedBags,
      freightPaise,
      unloadingPaise,
      landedUnitCostPaise: landedUnitCostPaise({ unitCostPaise: cost.costPaise, freightPaise, unloadingPaise, receivedBags }),
      claimStatus: shortBags + burstBags > 0 ? "open" : "none",
    },
  };
}

const CLAIM_MOVES: Partial<Record<ClaimStatus, readonly ClaimStatus[]>> = {
  open: ["claimed", "credited"],
  claimed: ["credited"],
};

/** A claim only moves forward: open → claimed → credited (open may go straight to credited). */
export function checkClaimChange(current: string, next: string): { ok: true; status: ClaimStatus } | { ok: false; error: string } {
  const label = isClaimStatus(next) ? CLAIM_LABELS[next] : String(next);
  if (!isClaimStatus(current) || !isClaimStatus(next) || !(CLAIM_MOVES[current] ?? []).includes(next)) {
    return { ok: false, error: `That claim can't change to ${label}.` };
  }
  return { ok: true, status: next };
}

/** What to claim back from the supplier: short + burst bags × the invoice cost per bag. */
export function claimValuePaise(bags: number, unitCostPaise: number): number {
  if (!Number.isSafeInteger(bags) || bags < 0 || !Number.isSafeInteger(unitCostPaise) || unitCostPaise < 0) {
    throw new RangeError("Bags and cost must be whole numbers");
  }
  const v = bags * unitCostPaise;
  if (!Number.isSafeInteger(v)) throw new RangeError("Claim value is too large");
  return v;
}
