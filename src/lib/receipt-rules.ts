/**
 * Receipt allocation rules as plain functions (no database) so they are easy to test.
 * Source: docs/idea.md section 6 (Collections) and section 7 (Ledgers).
 *
 * Choices where the spec is silent:
 * - Money is integer paise. Allocations are per order (so "oldest dues first" works),
 *   and are summed per firm for the posting lines (spec: one line per firm).
 * - "Oldest" = earliest dueSinceDate (YYYY-MM-DD text); ties keep the order given.
 * - Cheque details required: number, date, bank name. Online: UTR / reference + the
 *   firm whose bank account received the money. Cash: nothing extra.
 * - Remaining must be exactly 0 before save. Any excess is an explicit "advance"
 *   for a firm the collector picks; it is never silently dropped.
 * - Cheque lifecycle: pending -> cleared | bounced. Cleared and bounced are final.
 * - Bounce reverses the whole credit (every allocation line and the advance).
 * - Inter-firm balance (online/cheque only): the receiving firm owes each other firm
 *   the amount posted to that firm. Settling it is out of scope here.
 */
export const PAYMENT_MODES = ["cash", "online", "cheque"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

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

export type OutstandingItem = {
  orderId: string;
  firmId: string;
  retailerId?: string;
  /** YYYY-MM-DD */
  dueSinceDate: string;
  duePaise: number;
};

export type Allocation = { orderId: string; firmId: string; amountPaise: number };

/** Oldest first; ties keep the given order (stable sort). Items with nothing due are skipped. */
export function sortOldestFirst<T extends OutstandingItem>(items: readonly T[]): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => item.duePaise > 0)
    .sort((a, b) =>
      a.item.dueSinceDate < b.item.dueSinceDate ? -1 : a.item.dueSinceDate > b.item.dueSinceDate ? 1 : a.i - b.i,
    )
    .map(({ item }) => item);
}

function assertWhole(n: number, what: string): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`${what} must be a whole number of paise, 0 or more`);
}

/** Auto-split across firms, oldest dues first. Leftover (overpay) is the advance. */
export function autoSplitOldestFirst(
  receiptPaise: number,
  items: readonly OutstandingItem[],
): { allocations: Allocation[]; advancePaise: number } {
  assertWhole(receiptPaise, "Receipt amount");
  let left = receiptPaise;
  const allocations: Allocation[] = [];
  for (const item of sortOldestFirst(items)) {
    if (left === 0) break;
    assertWhole(item.duePaise, "Due amount");
    const take = Math.min(left, item.duePaise);
    allocations.push({ orderId: item.orderId, firmId: item.firmId, amountPaise: take });
    left -= take;
  }
  return { allocations, advancePaise: left };
}

/** "Clear full": allocations for every due of the given items (optionally one firm). */
export function clearFull(
  items: readonly OutstandingItem[],
  firmId?: string,
): { allocations: Allocation[]; totalPaise: number } {
  const allocations = sortOldestFirst(items)
    .filter((i) => firmId === undefined || i.firmId === firmId)
    .map((i) => ({ orderId: i.orderId, firmId: i.firmId, amountPaise: i.duePaise }));
  return { allocations, totalPaise: allocations.reduce((s, a) => s + a.amountPaise, 0) };
}

export type Advance = { firmId: string; amountPaise: number };

export type AllocationCheck =
  | { ok: true; remainingPaise: 0; firmTotals: Record<string, number> }
  | { ok: false; error: string; remainingPaise?: number };

/**
 * Checks a receipt before saving. `retailerId` is the receipt's retailer; every
 * outstanding item must belong to it (when the item says so).
 */
export function validateAllocation(
  receiptPaise: number,
  allocations: readonly Allocation[],
  items: readonly OutstandingItem[],
  opts: { retailerId?: string; advance?: Advance | null } = {},
): AllocationCheck {
  if (!Number.isSafeInteger(receiptPaise) || receiptPaise <= 0)
    return { ok: false, error: "Receipt amount must be a whole number of paise above 0." };
  const byOrder = new Map(items.map((i) => [i.orderId, i]));
  const seen = new Set<string>();
  const firmTotals: Record<string, number> = {};
  let allocated = 0;
  for (const a of allocations) {
    if (!Number.isSafeInteger(a.amountPaise)) return { ok: false, error: "Amounts must be whole paise." };
    if (a.amountPaise < 0) return { ok: false, error: "An amount cannot be negative." };
    if (a.amountPaise === 0) continue;
    const item = byOrder.get(a.orderId);
    if (!item) return { ok: false, error: `Order ${a.orderId} has no outstanding due.` };
    if (opts.retailerId && item.retailerId && item.retailerId !== opts.retailerId)
      return { ok: false, error: "An allocation belongs to a different retailer." };
    if (item.firmId !== a.firmId) return { ok: false, error: "Allocation firm does not match the order's firm." };
    if (seen.has(a.orderId)) return { ok: false, error: `Order ${a.orderId} is allocated twice.` };
    seen.add(a.orderId);
    if (a.amountPaise > item.duePaise) return { ok: false, error: "An allocation is more than the amount due." };
    allocated += a.amountPaise;
    firmTotals[a.firmId] = (firmTotals[a.firmId] ?? 0) + a.amountPaise;
  }
  let advancePaise = 0;
  if (opts.advance) {
    if (!Number.isSafeInteger(opts.advance.amountPaise) || opts.advance.amountPaise < 0)
      return { ok: false, error: "Advance must be a whole number of paise, 0 or more." };
    advancePaise = opts.advance.amountPaise;
    if (advancePaise > 0) {
      if (!opts.advance.firmId) return { ok: false, error: "Pick the firm that holds the advance." };
      firmTotals[opts.advance.firmId] = (firmTotals[opts.advance.firmId] ?? 0) + advancePaise;
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
