/**
 * Cash wallet rules as plain functions (no database) so they are easy to test.
 * Source: docs/idea.md section 6.2 (Cash) and section 7 (collector ledger).
 *
 * Choices where the spec is silent:
 * - One wallet per collector per firm. Money is integer paise.
 * - Wallet rows are append-only (`wallet_movements`). Kinds:
 *     collected          +amount  a cash receipt line was taken
 *     handover_request   -amount  collector says "I am handing this over" (not counted until confirmed)
 *     handover_confirmed -amount  accounts/admin confirmed the request (refId = the request row)
 *     handover_rejected   0       accounts/admin refused the request (refId = the request row)
 *     reversed           -amount  a cash receipt was reversed, so its cash leaves the wallet
 *                                 (receiptId = the reversed receipt)
 * - balance = collected - reversed - confirmed handovers. available = balance - still-pending
 *   requests, so a collector cannot ask to hand over the same cash twice.
 * - Only accounts or admin confirm a handover, and nobody confirms their own handover.
 */
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

export function validateHandoverRequest(amountPaise: number, availablePaise: number): HandoverCheck {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0)
    return { ok: false, error: "Enter an amount above zero." };
  if (amountPaise > availablePaise) return { ok: false, error: "That is more cash than your wallet holds." };
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

/** Wallet rows for a saved cash receipt: one per firm line, for the collector. */
export function collectedMovements(
  mode: string,
  lines: readonly { firmId: string; amountPaise: number }[],
): { firmId: string; kind: "collected"; amountPaise: number }[] {
  if (mode !== "cash") return [];
  return lines.filter((l) => l.amountPaise > 0).map((l) => ({ firmId: l.firmId, kind: "collected" as const, amountPaise: l.amountPaise }));
}
