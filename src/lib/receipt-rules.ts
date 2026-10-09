/**
 * Receipt allocation rules as plain functions (no database) so they are easy to test.
 * Source: docs/idea.md section 6 (Collections) and section 7 (Ledgers).
 *
 * Choices where the spec is silent:
 * - Money is integer paise. Allocation is PER FIRM (spec 6.1: one row per firm with dues).
 *   Each firm's dues come from its ledger (firm-dues.ts), so openings, advances, bounces
 *   and cancelled orders all count. A line may not be more than that firm's dues.
 *   Inside a firm the ledger applies payments oldest first by itself, so no per-order rows
 *   are stored for new receipts (older rows that name an order stay as they are).
 * - Auto-split = every firm's due items oldest first (openings count as the oldest);
 *   ties keep the firm order given.
 * - Cheque details required: number, date, bank name. Online: UTR / reference + the
 *   firm whose bank account received the money. Cash: nothing extra.
 * - Remaining must be exactly 0 before save. Any excess is an explicit "advance"
 *   for a firm the collector picks; it is never silently dropped.
 * - Cheque lifecycle: pending -> cleared | bounced. Cleared and bounced are final.
 * - Bounce reverses the whole credit (every allocation line and the advance).
 * - Inter-firm balance (online/cheque only): the receiving firm owes each other firm
 *   the amount posted to that firm. Settling it is out of scope here (phase 2).
 */
export const PAYMENT_MODES = ["cash", "online", "cheque"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/**
 * Every receipt status. Cash: received. Online: unverified -> verified.
 * Cheque: pending -> cleared | bounced. Any receipt can end as "reversed" (taken back by accounts).
 */
export const RECEIPT_STATUSES = [
  "received",
  "unverified",
  "verified",
  "pending",
  "cleared",
  "bounced",
  "reversed",
] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export const MODE_LABELS: Record<string, string> = { cash: "Cash", online: "Online", cheque: "Cheque" };

/** Status words and the colour group of the status chip (which only knows order colours). */
export function receiptChip(status: string): {
  status: "pending" | "approved" | "rejected" | "delivered";
  label: string;
} {
  switch (status) {
    case "received":
      return { status: "delivered", label: "Received" };
    case "unverified":
      return { status: "pending", label: "Not verified" };
    case "verified":
      return { status: "delivered", label: "Verified" };
    case "pending":
      return { status: "pending", label: "Cheque pending" };
    case "cleared":
      return { status: "delivered", label: "Cleared" };
    case "bounced":
      return { status: "rejected", label: "Bounced" };
    case "reversed":
      return { status: "rejected", label: "Reversed" };
    default:
      return { status: "pending", label: status };
  }
}

export type ModeDetails = {
  utr?: string | null;
  receivedFirmId?: string | null;
  chequeNumber?: string | null;
  chequeDate?: string | null;
  bankName?: string | null;
};

export function validateModeDetails(mode: string, d: ModeDetails): string | null {
  const has = (v: string | null | undefined) => typeof v === "string" && v.trim().length > 0;
  if (mode === "cash") return null;
  if (mode === "online") {
    if (!has(d.utr)) return "Enter the UTR / reference number.";
    if (!has(d.receivedFirmId)) return "Pick the firm whose bank account received the money.";
    return null;
  }
  if (mode === "cheque") {
    if (!has(d.chequeNumber)) return "Enter the cheque number.";
    if (!has(d.chequeDate) || !/^\d{4}-\d{2}-\d{2}$/.test(d.chequeDate!.trim()))
      return "Enter the cheque date.";
    if (!has(d.bankName)) return "Enter the bank name.";
    if (!has(d.receivedFirmId)) return "Pick the firm whose bank account will receive the cheque.";
    return null;
  }
  return "Pick a payment mode: cash, online or cheque.";
}

/** What one firm is owed, as the receipt screen needs it (built by firm-dues.ts). */
export type FirmDue = {
  firmId: string;
  duePaise: number;
  /** Items still owed, oldest first. */
  items: readonly { kind?: string; dueSince: Date | string; duePaise: number }[];
};

/** One allocation line: the part of this receipt that goes to one firm's dues. */
export type Allocation = { firmId: string; amountPaise: number };

function assertWhole(n: number, what: string): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`${what} must be a whole number of paise, 0 or more`);
}

/**
 * Auto-split across firms: every firm's items oldest first (openings count as the
 * oldest), each paid in full before the next. Leftover (overpay) is the advance.
 * Returns one allocation per firm that gets money, in the firm order given.
 */
export function autoSplitByFirm(
  receiptPaise: number,
  dues: readonly FirmDue[],
): { allocations: Allocation[]; advancePaise: number } {
  assertWhole(receiptPaise, "Receipt amount");
  const queue = dues.flatMap((f, firmIndex) =>
    f.items.map((item, itemIndex) => ({
      firmId: f.firmId,
      opening: item.kind === "opening",
      at: new Date(item.dueSince).getTime(),
      firmIndex,
      itemIndex,
      duePaise: item.duePaise,
    })),
  );
  queue.sort(
    (a, b) =>
      Number(b.opening) - Number(a.opening) || a.at - b.at || a.firmIndex - b.firmIndex || a.itemIndex - b.itemIndex,
  );
  let left = receiptPaise;
  const totals = new Map<string, number>();
  for (const item of queue) {
    if (left === 0) break;
    assertWhole(item.duePaise, "Due amount");
    const take = Math.min(left, item.duePaise);
    if (take > 0) totals.set(item.firmId, (totals.get(item.firmId) ?? 0) + take);
    left -= take;
  }
  const allocations = dues
    .filter((f) => totals.has(f.firmId))
    .map((f) => ({ firmId: f.firmId, amountPaise: totals.get(f.firmId)! }));
  return { allocations, advancePaise: left };
}

/**
 * What the entry screen shows: firms the collector typed (or tapped "Clear full" on) keep
 * their amount; every other firm with dues shares what is left by auto-split.
 * `leftoverPaise` is what is not allocated (above 0 = advance, below 0 = too much allocated).
 */
export function fillAllocation(
  receiptPaise: number,
  dues: readonly FirmDue[],
  fixed: Readonly<Record<string, number>>,
): { amounts: Record<string, number>; leftoverPaise: number } {
  const amounts: Record<string, number> = {};
  let fixedTotal = 0;
  for (const f of dues) {
    if (f.firmId in fixed) {
      amounts[f.firmId] = fixed[f.firmId];
      fixedTotal += fixed[f.firmId];
    }
  }
  const rest = dues.filter((f) => !(f.firmId in fixed));
  const pool = Math.max(0, receiptPaise - fixedTotal);
  const auto = autoSplitByFirm(Number.isSafeInteger(pool) ? pool : 0, rest);
  for (const f of rest) amounts[f.firmId] = 0;
  for (const a of auto.allocations) amounts[a.firmId] = a.amountPaise;
  const allocated = Object.values(amounts).reduce((s, n) => s + n, 0);
  return { amounts, leftoverPaise: receiptPaise - allocated };
}

export type Advance = { firmId: string; amountPaise: number };

export type AllocationCheck =
  | { ok: true; remainingPaise: 0; firmTotals: Record<string, number> }
  | { ok: false; error: string; remainingPaise?: number };

/**
 * Checks a receipt before saving: each line is one firm that has dues, at most that
 * firm's dues, each firm once. Any excess is an explicit advance with a firm.
 * Remaining must be 0.
 */
export function validateAllocation(
  receiptPaise: number,
  allocations: readonly Allocation[],
  dues: readonly FirmDue[],
  advance: Advance | null = null,
): AllocationCheck {
  if (!Number.isSafeInteger(receiptPaise) || receiptPaise <= 0)
    return { ok: false, error: "Receipt amount must be a whole number of paise above 0." };
  const dueByFirm = new Map(dues.map((f) => [f.firmId, f.duePaise]));
  const seen = new Set<string>();
  const firmTotals: Record<string, number> = {};
  let allocated = 0;
  for (const a of allocations) {
    if (!Number.isSafeInteger(a.amountPaise)) return { ok: false, error: "Amounts must be whole paise." };
    if (a.amountPaise < 0) return { ok: false, error: "An amount cannot be negative." };
    if (seen.has(a.firmId)) return { ok: false, error: "A firm is allocated twice." };
    seen.add(a.firmId);
    if (a.amountPaise === 0) continue;
    const due = dueByFirm.get(a.firmId) ?? 0;
    if (due <= 0) return { ok: false, error: "A firm has no dues. Keep the money as advance instead." };
    if (a.amountPaise > due) return { ok: false, error: "An amount is more than that firm's dues." };
    allocated += a.amountPaise;
    firmTotals[a.firmId] = a.amountPaise;
  }
  let advancePaise = 0;
  if (advance) {
    if (!Number.isSafeInteger(advance.amountPaise) || advance.amountPaise < 0)
      return { ok: false, error: "Advance must be a whole number of paise, 0 or more." };
    advancePaise = advance.amountPaise;
    if (advancePaise > 0) {
      if (!advance.firmId) return { ok: false, error: "Pick the firm that holds the advance." };
      firmTotals[advance.firmId] = (firmTotals[advance.firmId] ?? 0) + advancePaise;
    }
  }
  const remaining = receiptPaise - allocated - advancePaise;
  if (remaining !== 0)
    return {
      ok: false,
      remainingPaise: remaining,
      error: remaining > 0 ? "Remaining must be zero: allocate the rest or keep it as advance." : "Allocated more than the receipt amount.",
    };
  return { ok: true, remainingPaise: 0, firmTotals };
}

export type PostingLine = { firmId: string; amountPaise: number };

/** One posting line per firm (allocations + advance). Ledger credit is the negative of this. */
export function firmLines(allocations: readonly Allocation[], advance?: Advance | null): PostingLine[] {
  const totals = new Map<string, number>();
  for (const a of allocations) if (a.amountPaise > 0) totals.set(a.firmId, (totals.get(a.firmId) ?? 0) + a.amountPaise);
  if (advance && advance.amountPaise > 0) totals.set(advance.firmId, (totals.get(advance.firmId) ?? 0) + advance.amountPaise);
  return [...totals].map(([firmId, amountPaise]) => ({ firmId, amountPaise }));
}

/** Online/cheque money landing in one firm's account but posted to other firms. */
export function interFirmBalances(
  receivedFirmId: string,
  lines: readonly PostingLine[],
): { owedByFirmId: string; owedToFirmId: string; amountPaise: number }[] {
  return lines
    .filter((l) => l.firmId !== receivedFirmId && l.amountPaise > 0)
    .map((l) => ({ owedByFirmId: receivedFirmId, owedToFirmId: l.firmId, amountPaise: l.amountPaise }));
}

export type ChequeStatus = "pending" | "cleared" | "bounced";

export function canChangeChequeStatus(from: ChequeStatus, to: ChequeStatus): boolean {
  return from === "pending" && (to === "cleared" || to === "bounced");
}

/** Bounce reversal: each posted line is mirrored with the opposite sign, so the credit is fully undone. */
export function bounceReversal(lines: readonly PostingLine[]): PostingLine[] {
  return lines.map((l) => ({ firmId: l.firmId, amountPaise: -l.amountPaise }));
}
