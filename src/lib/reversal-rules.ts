/**
 * Reversing a dispatch (all of a load, or bags the shop sent back) and reversing a purchase (cement v2 B2).
 * Plain functions (no database) so they are easy to test; lib/reversals.ts runs them inside the transaction.
 *
 * Owner decision D3: admin only, any time, a reason from the reversal list (reason-codes.ts) required.
 * The books stay append-only: a reversal is new rows (a dispatch row with minus bags + a `return` stock
 * movement + a `dispatch_reversal` ledger credit; or a `purchase_reversal` movement + supplier entry).
 *
 * Choices where the spec is silent:
 * - A load can be reversed in several parts (bags returned twice), never more than its bags in total.
 * - A dispatch reversal credits the shop the returned bags x THAT load's rate (what it was billed at).
 * - A purchase reversal credits the supplier the bags x the purchase's INVOICE cost per bag (what the
 *   supplier entry used); short / burst claims on its header are untouched. It may take back at most the
 *   bags received (billed − short − burst) and at most the bags at that place now.
 * - The order's status follows the bags still sent (statusAfterReversal); a cancelled order stays cancelled.
 */
import { orderDebitPaise } from "./ledger-rules";
import { checkReason, reasonText, type ReversalReasonCode } from "./reason-codes";
import { can } from "./permissions";
import { bagsText } from "./words";

/** Orders that can hold dispatches, so the only ones whose loads can be reversed. */
export const REVERSIBLE_ORDER_STATUSES = ["partly_dispatched", "dispatched", "cancelled"] as const;

export function isReversibleOrderStatus(status: string): boolean {
  return (REVERSIBLE_ORDER_STATUSES as readonly string[]).includes(status);
}

/**
 * The order's status once `netSentAfter` bags (loads minus reversals) are still sent:
 * cancelled stays cancelled; none → approved (it can be sent again), some → partly_dispatched,
 * all → dispatched. Null for a status that cannot hold dispatches.
 */
export function statusAfterReversal(status: string, orderedBags: number, netSentAfter: number): string | null {
  if (!isReversibleOrderStatus(status)) return null;
  if (status === "cancelled") return "cancelled";
  if (netSentAfter <= 0) return "approved";
  if (netSentAfter >= orderedBags) return "dispatched";
  return "partly_dispatched";
}

/** Bags of a load (or purchase) still left to reverse; never below 0. */
export function bagsLeftToReverse(totalBags: number, reversedBags: number): number {
  return Math.max(0, totalBags - reversedBags);
}

export type Refusal = { ok: false; error: string };

export type DispatchReversalPlan = {
  ok: true;
  code: ReversalReasonCode;
  note: string;
  /** The shop's credit, NEGATIVE paise: −(bags × the load's rate). */
  creditPaise: number;
  newStatus: string;
  /** "Wrong entry" or "Wrong entry · note", for the ledger and stock rows. */
  reasonText: string;
};

/**
 * Can an admin take `bags` of this load back? `reversedBags` = bags of it already reversed,
 * `netSentBags` = the order's net sent bags now (every load minus every reversal).
 */
export function planDispatchReversal(input: {
  role: string | null | undefined;
  order: { status: string; bags: number };
  dispatch: { bags: number; ratePaise: number; reversesDispatchId: string | null };
  reversedBags: number;
  netSentBags: number;
  bags: unknown;
  reasonCode: unknown;
  note: unknown;
}): DispatchReversalPlan | Refusal {
  if (!can(input.role, "reverseStock")) return { ok: false, error: "Only an admin can reverse a dispatch." };
  const { dispatch, order } = input;
  if (dispatch.reversesDispatchId !== null || dispatch.bags <= 0) {
    return { ok: false, error: "This row is already a reversal." };
  }
  const bags = input.bags;
  if (typeof bags !== "number" || !Number.isInteger(bags) || bags <= 0) {
    return { ok: false, error: "Bags must be a whole number above zero." };
  }
  const left = bagsLeftToReverse(dispatch.bags, input.reversedBags);
  if (left === 0) return { ok: false, error: "This load is already fully reversed." };
  if (bags > left) return { ok: false, error: `Only ${bagsText(left)} of this load are left to reverse.` };
  if (!isReversibleOrderStatus(order.status)) return { ok: false, error: "This order has no loads to reverse." };
  const why = checkReason("reversal", input.reasonCode, input.note);
  if (!why.ok) return why;
  const amount = orderDebitPaise(bags, dispatch.ratePaise);
  if (amount === null) return { ok: false, error: "This load has no rate." };
  const newStatus = statusAfterReversal(order.status, order.bags, input.netSentBags - bags);
  if (newStatus === null) return { ok: false, error: "This order has no loads to reverse." };
  return {
    ok: true,
    code: why.code,
    note: why.note,
    creditPaise: -amount,
    newStatus,
    reasonText: reasonText(why.code, why.note, "reversal"),
  };
}

export type PurchaseReversalPlan = {
  ok: true;
  code: ReversalReasonCode;
  note: string;
  /** What we owe the supplier less, NEGATIVE paise: −(bags × the purchase's invoice cost per bag). */
  supplierPaise: number;
  reasonText: string;
};

/**
 * Can an admin take `bags` of this purchase out again? Max = received bags (the header's, else the
 * movement's) − bags already reversed, and no more than `stockAtPlace` (bags of that product there now).
 */
export function planPurchaseReversal(input: {
  role: string | null | undefined;
  purchase: { type: string; bags: number; receivedBags: number | null; unitCostPaise: number | null };
  reversedBags: number;
  stockAtPlace: number;
  placeName: string;
  bags: unknown;
  reasonCode: unknown;
  note: unknown;
}): PurchaseReversalPlan | Refusal {
  if (!can(input.role, "reverseStock")) return { ok: false, error: "Only an admin can reverse a purchase." };
  const { purchase } = input;
  if (purchase.type !== "purchase") return { ok: false, error: "This is not a purchase." };
  if (purchase.unitCostPaise === null) return { ok: false, error: "This purchase has no cost. Use a stock correction." };
  const bags = input.bags;
  if (typeof bags !== "number" || !Number.isInteger(bags) || bags <= 0) {
    return { ok: false, error: "Bags must be a whole number above zero." };
  }
  const left = bagsLeftToReverse(purchase.receivedBags ?? purchase.bags, input.reversedBags);
  if (left === 0) return { ok: false, error: "This purchase is already fully reversed." };
  if (bags > left) return { ok: false, error: `Only ${bagsText(left)} of this purchase are left to reverse.` };
  if (bags > input.stockAtPlace) {
    return { ok: false, error: `Only ${bagsText(Math.max(0, input.stockAtPlace))} are at ${input.placeName} now.` };
  }
  const why = checkReason("reversal", input.reasonCode, input.note);
  if (!why.ok) return why;
  const amount = orderDebitPaise(bags, purchase.unitCostPaise);
  if (amount === null) return { ok: false, error: "This purchase has no cost. Use a stock correction." };
  return { ok: true, code: why.code, note: why.note, supplierPaise: -amount, reasonText: reasonText(why.code, why.note, "reversal") };
}

/** Bags reversed so far per load id, from an order's dispatch rows (loads and reversal rows together). */
export function reversedByLoad(rows: readonly { bags: number; reversesDispatchId: string | null }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.reversesDispatchId && r.bags < 0) out.set(r.reversesDispatchId, (out.get(r.reversesDispatchId) ?? 0) - r.bags);
  }
  return out;
}
