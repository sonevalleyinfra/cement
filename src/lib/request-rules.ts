/**
 * Stops a double tap (or a retry after a slow network) from saving the same thing twice.
 * Plain functions: no database, no request.
 *
 * Every form that creates something (payment, order, dispatch, purchase, supplier entry,
 * cash handover request, ledger adjustment, stock entries) makes a one-time `requestId` when it
 * opens and sends it with the save. The server writes that id into `form_submissions` in the
 * same transaction as the new record, together with the id of what was saved (`saveOnce` in
 * lib/form-submissions.ts):
 * - First time: the id is new, the record is created.
 * - Same id again (second tap, retry): the id is already there, nothing is created and the
 *   first save's answer is given again ("replay"), but only when that first save stored its result.
 * - If a save is refused (an error, even one found halfway through), its whole transaction is
 *   undone, the id included, so nothing is kept and the person can fix the form and save again.
 *   The form also makes a fresh id after every answer it gets (`nextRequestId`).
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
  "purchase_claim",
  "dispatch_reversal",
  "purchase_reversal",
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
 * action, and the first save stored what it made), or refuse (someone else's id, another
 * action's, or a row without a stored result: never answer "saved" when nothing was saved).
 */
export function replayDecision(
  saved: SavedSubmission,
  now: { kind: RequestKind; actorId: string },
): { ok: true; resultId: string } | { ok: false; error: string } {
  if (saved.kind !== now.kind || saved.actorId !== now.actorId) return { ok: false, error: REFRESH_AND_RETRY };
  if (!saved.resultId) return { ok: false, error: REFRESH_AND_RETRY };
  return { ok: true, resultId: saved.resultId };
}

/**
 * The form's id after a save attempt. Any answer from the server (saved, or refused and fully
 * undone) means the next tap is a new attempt: a fresh id. Only when no answer came back (the
 * network dropped, so the save may or may not have happened) the same id is kept, so a retry
 * can never save twice.
 */
export function nextRequestId(current: string, answered: boolean, fresh: () => string): string {
  return answered ? fresh() : current;
}
