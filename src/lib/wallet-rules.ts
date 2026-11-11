/**
 * Cash held by staff ("wallet") as plain functions (no database) so they are easy to test.
 * Source: docs/idea.md section 6 (Cash: the cash is held by the staff member who recorded it;
 * they hand it over; accounts tap "Confirm", can confirm part, or reject a wrong request).
 *
 * Choices where the spec is silent:
 * - One wallet per staff member (the "collector"). Money is integer paise.
 * - Wallet rows are append-only (`wallet_movements`). Kinds:
 *     collected          +amount  a cash receipt was taken
 *     handover_request   -amount  collector says "I am handing this over" (not counted until confirmed)
 *     handover_confirmed -amount  accounts/admin received this much (refId = the request row). It may be
 *                                 less than the request ("part"): the rest stays with the collector.
 *     handover_rejected   0       accounts/admin refused the request, with a reason in `note`
 *                                 (refId = the request row)
 *     reversed           -amount  a cash receipt was reversed, so its cash leaves the wallet
 *                                 (receiptId = the reversed receipt)
 * - balance = collected - reversed - confirmed handovers. available = balance - still-pending
 *   requests, so a collector cannot ask to hand over the same cash twice.
 * - Only accounts or admin confirm a handover, and nobody confirms their own handover.
 */
import { checkReason } from "./receipt-rules";
import { hasAnyRole } from "./roles";

export const WALLET_KINDS = [
  "collected",
  "handover_request",
  "handover_confirmed",
  "handover_rejected",
  "reversed",
] as const;
export type WalletKind = (typeof WALLET_KINDS)[number];

export type WalletMovement = {
  id?: string;
  kind: string;
  /** Always stored as a positive size; the kind decides the direction. */
  amountPaise: number;
  /** For confirmed / rejected rows: the request row they answer. */
  refId?: string | null;
  receiptId?: string | null;
  createdAt?: Date | number;
};

export type WalletBalance = {
  collectedPaise: number;
  /** Cash taken back out because its receipt was reversed. */
  reversedPaise: number;
  handedOverPaise: number;
  pendingPaise: number;
  /** Cash the collector should be holding. */
  balancePaise: number;
  /** Cash that can still be put into a new handover request. */
  availablePaise: number;
};

export function walletBalance(movements: readonly WalletMovement[]): WalletBalance {
  let collected = 0;
  let reversed = 0;
  let handed = 0;
  const requests = new Map<string, number>();
  const answered = new Set<string>();
  for (const m of movements) {
    if (m.kind === "collected") collected += m.amountPaise;
    else if (m.kind === "reversed") reversed += m.amountPaise;
    else if (m.kind === "handover_confirmed") {
      handed += m.amountPaise;
      if (m.refId) answered.add(m.refId);
    } else if (m.kind === "handover_rejected") {
      if (m.refId) answered.add(m.refId);
    } else if (m.kind === "handover_request" && m.id) requests.set(m.id, m.amountPaise);
  }
  let pending = 0;
  for (const [id, amount] of requests) if (!answered.has(id)) pending += amount;
  const balance = collected - reversed - handed;
  return {
    collectedPaise: collected,
    reversedPaise: reversed,
    handedOverPaise: handed,
    pendingPaise: pending,
    balancePaise: balance,
    availablePaise: balance - pending,
  };
}

/** Request ids that nobody has answered yet. */
export function pendingRequestIds(movements: readonly WalletMovement[]): string[] {
  const answered = new Set(movements.filter((m) => m.refId).map((m) => m.refId as string));
  return movements.filter((m) => m.kind === "handover_request" && m.id && !answered.has(m.id)).map((m) => m.id as string);
}

export type HandoverCheck = { ok: true } | { ok: false; error: string };

export function validateHandoverRequest(amountPaise: number, availablePaise: number, pendingPaise = 0): HandoverCheck {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0)
    return { ok: false, error: "Enter an amount above zero." };
  if (amountPaise > availablePaise) {
    // Cash already in an unanswered request cannot be handed over twice.
    if (pendingPaise > 0 && amountPaise <= availablePaise + pendingPaise)
      return { ok: false, error: "That cash is already pending handover." };
    return { ok: false, error: "That is more cash than you hold." };
  }
  return { ok: true };
}

/** Accounts and admin confirm; nobody confirms their own handover. */
export function canConfirmHandover(
  role: string | null | undefined,
  confirmerId: string,
  collectorId: string,
): HandoverCheck {
  if (!hasAnyRole(role, ["accounts"])) return { ok: false, error: "Only accounts or admin can confirm a handover." };
  if (confirmerId === collectorId) return { ok: false, error: "You cannot confirm your own handover." };
  return { ok: true };
}

/** A request can be answered once. */
export function canAnswerRequest(alreadyAnswered: boolean): HandoverCheck {
  return alreadyAnswered ? { ok: false, error: "This handover was already answered." } : { ok: true };
}

export type HandoverAnswer = { action: "confirm"; amountPaise: number } | { action: "reject"; reason: unknown };

export type HandoverAnswerPlan =
  | {
      ok: true;
      kind: "handover_confirmed" | "handover_rejected";
      /** Cash received (0 for a rejection). */
      amountPaise: number;
      /** True when less than the request was received. */
      part: boolean;
      /** Rejection reason ("" when confirmed). */
      note: string;
    }
  | { ok: false; error: string };

/**
 * Accounts answer one handover request: confirm the full amount, confirm a smaller amount
 * actually received (the rest stays with the collector), or reject it with a reason.
 */
export function planHandoverAnswer(
  role: string | null | undefined,
  confirmerId: string,
  request: { collectorId: string; amountPaise: number },
  alreadyAnswered: boolean,
  answer: HandoverAnswer,
): HandoverAnswerPlan {
  const allowed = canConfirmHandover(role, confirmerId, request.collectorId);
  if (!allowed.ok) return allowed;
  const once = canAnswerRequest(alreadyAnswered);
  if (!once.ok) return once;
  if (answer.action === "reject") {
    const r = checkReason(answer.reason);
    if (!r.ok) return r;
    return { ok: true, kind: "handover_rejected", amountPaise: 0, part: false, note: r.reason };
  }
  const amount = answer.amountPaise;
  if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, error: "Enter the amount received." };
  if (amount > request.amountPaise) return { ok: false, error: "That is more than the handover." };
  return { ok: true, kind: "handover_confirmed", amountPaise: amount, part: amount < request.amountPaise, note: "" };
}

export type HeldByRetailer = {
  retailerId: string | null;
  retailerName: string;
  amountPaise: number;
  receiptCount: number;
};

/**
 * Breaks down a collector's currently held cash by the retailer(s) it came from.
 * Subtracts reversed receipts directly (by `receiptId`), then deducts confirmed handovers
 * chronologically (FIFO: oldest collections are handed over first), and aggregates what
 * remains by retailer in descending order of amount.
 */
export function heldCashByRetailer(
  movements: readonly WalletMovement[],
  retailerOfReceipt: ReadonlyMap<string, { retailerId: string; retailerName: string }>,
): HeldByRetailer[] {
  const reversedByReceipt = new Map<string, number>();
  let unlinkedReversed = 0;
  let handedOver = 0;
  const collected: WalletMovement[] = [];

  for (const m of movements) {
    if (m.kind === "collected") collected.push(m);
    else if (m.kind === "handover_confirmed") handedOver += m.amountPaise;
    else if (m.kind === "reversed") {
      if (m.receiptId) reversedByReceipt.set(m.receiptId, (reversedByReceipt.get(m.receiptId) ?? 0) + m.amountPaise);
      else unlinkedReversed += m.amountPaise;
    }
  }

  collected.sort((a, b) => {
    const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : typeof a.createdAt === "number" ? a.createdAt : 0;
    const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : typeof b.createdAt === "number" ? b.createdAt : 0;
    return ta - tb;
  });

  let remainingDeduction = handedOver + unlinkedReversed;
  const byRetailer = new Map<string, HeldByRetailer>();

  for (const m of collected) {
    let net = m.amountPaise;
    if (m.receiptId) {
      const rev = reversedByReceipt.get(m.receiptId) ?? 0;
      if (rev > 0) {
        const used = Math.min(net, rev);
        net -= used;
        reversedByReceipt.set(m.receiptId, rev - used);
      }
    }
    if (net <= 0) continue;

    const consumed = Math.min(net, remainingDeduction);
    remainingDeduction -= consumed;
    const held = net - consumed;
    if (held <= 0) continue;

    const shop = m.receiptId ? retailerOfReceipt.get(m.receiptId) : undefined;
    const key = shop ? `shop:${shop.retailerId}` : "unlinked";
    const prev = byRetailer.get(key);
    if (prev) {
      prev.amountPaise += held;
      prev.receiptCount += 1;
    } else {
      byRetailer.set(key, {
        retailerId: shop ? shop.retailerId : null,
        retailerName: shop ? shop.retailerName : "Other / unlinked receipt",
        amountPaise: held,
        receiptCount: 1,
      });
    }
  }

  return [...byRetailer.values()].sort((a, b) => b.amountPaise - a.amountPaise);
}
