/**
 * Stops a double tap (or a retry after a slow network) from saving the same thing twice.
 * Plain functions: no database, no request.
 *
 * Every form that creates something (payment, order, dispatch, purchase, supplier entry,
 * cash handover request, ledger adjustment, stock entries) makes a one-time `requestId` when it
 * opens and sends it with the save. The server writes that id into `form_submissions` in the
 * same transaction as the new record (see lib/form-submissions.ts):
 * - First time: the id is new, the record is created.
 * - Same id again (second tap, retry): the id is already there, nothing is created and the
 *   first save's answer is given again ("replay").
 * - If the first save was refused (an error), its transaction is undone, so the id is free and
 *   the person can fix the form and save again.
 * - The id belongs to one person and one kind of action; anything else is refused
 *   ("Refresh the page and try again").
 */
import { isUuid } from "./ids";

export const REQUEST_KINDS = [
  "payment",
  "order",
  "dispatch",
  "purchase",
  "opening_stock",
  "stock_adjustment",
  "stock_transfer",
  "supplier_entry",
  "handover_request",
  "ledger_adjustment",
] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REFRESH_AND_RETRY = "Refresh the page and try again.";

/** The form's one-time id: must be a uuid. */
export function checkRequestId(value: unknown): { ok: true; id: string } | { ok: false; error: string } {
  return isUuid(value) ? { ok: true, id: value.toLowerCase() } : { ok: false, error: REFRESH_AND_RETRY };
}

export type SavedSubmission = { kind: string; actorId: string; resultId: string | null };

/**
 * What to do when the id was already saved: give the first answer again (same person, same
 * action), or refuse (someone else's id, or another action's).
 */
export function replayDecision(
  saved: SavedSubmission,
  now: { kind: RequestKind; actorId: string },
): { ok: true; resultId: string | null } | { ok: false; error: string } {
  if (saved.kind !== now.kind || saved.actorId !== now.actorId) return { ok: false, error: REFRESH_AND_RETRY };
  return { ok: true, resultId: saved.resultId };
}
