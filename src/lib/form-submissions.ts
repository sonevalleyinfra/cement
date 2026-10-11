import { eq } from "drizzle-orm";
import { db } from "@/db";
import { formSubmissions } from "@/db/schema";
import { replayDecision, type RequestKind } from "@/lib/request-rules";

/** An open database transaction. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type Refusal = { ok: false; error: string };

/** Thrown inside the transaction to undo everything in it, the form's id included. */
class Refused extends Error {
  constructor(readonly result: Refusal) {
    super(result.error);
  }
}

/**
 * Server-only. Saves one form at most once (rules in request-rules.ts). Every action with a
 * one-time `requestId` uses this, so they all behave the same:
 * 1. In one transaction, the id is written first. A second tap at the same moment waits here
 *    (same primary key) until the first save ends.
 * 2. `work` does the checks and the writes and answers `{ ok: true, resultId }` (the id of what it
 *    made) or `{ ok: false, error }`.
 * 3. Refused: the whole transaction is undone (the id too), so nothing at all is kept and the
 *    person can fix the form and save again.
 *    Saved: the result id is stored with the form's id and everything is kept together.
 * A form id that was already saved answers with the first save's result (`replay: true`) and
 * writes nothing.
 * Database errors (for example a unique rule) are thrown as usual; the transaction is undone.
 */
export async function saveOnce(
  request: { id: string; kind: RequestKind; actorId: string },
  work: (tx: Tx) => Promise<{ ok: true; resultId: string } | Refusal>,
): Promise<{ ok: true; resultId: string; replay: boolean } | Refusal> {
  try {
    return await db.transaction(async (tx) => {
      const made = await tx
        .insert(formSubmissions)
        .values({ id: request.id, kind: request.kind, actorId: request.actorId })
        .onConflictDoNothing({ target: formSubmissions.id })
        .returning({ id: formSubmissions.id });
      if (made.length === 0) {
        const [saved] = await tx
          .select({ kind: formSubmissions.kind, actorId: formSubmissions.actorId, resultId: formSubmissions.resultId })
          .from(formSubmissions)
          .where(eq(formSubmissions.id, request.id));
        const replay = replayDecision(saved ?? { kind: "", actorId: "", resultId: null }, request);
        return replay.ok ? { ...replay, replay: true } : replay;
      }
      const res = await work(tx);
      if (!res.ok) throw new Refused(res);
      await tx.update(formSubmissions).set({ resultId: res.resultId }).where(eq(formSubmissions.id, request.id));
      return { ok: true, resultId: res.resultId, replay: false };
    });
  } catch (e) {
    if (e instanceof Refused) return e.result;
    throw e;
  }
}
