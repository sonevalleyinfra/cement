import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { formSubmissions } from "@/db/schema";
import { replayDecision, type RequestKind } from "@/lib/request-rules";

/** An open database transaction. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Server-only. Call first inside the transaction that creates the record (rules in request-rules.ts).
 * - `{ fresh: true }`: a new id, go on and create the record (call `saveRequestResult` if the form needs an id back).
 * - `{ fresh: false, ... }`: this form was already saved: create nothing and answer with `result`.
 * Two taps at the same moment: the second waits on the first (same primary key) and then sees its row.
 */
export async function claimRequest(
  tx: Tx,
  requestId: string,
  kind: RequestKind,
  actorId: string,
): Promise<{ fresh: true } | { fresh: false; result: { ok: true; resultId: string | null } | { ok: false; error: string } }> {
  const made = await tx
    .insert(formSubmissions)
    .values({ id: requestId, kind, actorId })
    .onConflictDoNothing({ target: formSubmissions.id })
    .returning({ id: formSubmissions.id });
  if (made.length > 0) return { fresh: true };
  const [saved] = await tx
    .select({ kind: formSubmissions.kind, actorId: formSubmissions.actorId, resultId: formSubmissions.resultId })
    .from(formSubmissions)
    .where(eq(formSubmissions.id, requestId));
  return { fresh: false, result: replayDecision(saved ?? { kind: "", actorId: "", resultId: null }, { kind, actorId }) };
}

/** Keeps the id of what was created, so a repeated tap can be answered with it. */
export async function saveRequestResult(
  tx: Tx,
  requestId: string,
  resultId: string,
): Promise<void> {
  await tx.update(formSubmissions).set({ resultId }).where(eq(formSubmissions.id, requestId));
}
