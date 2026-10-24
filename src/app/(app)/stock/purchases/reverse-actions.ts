"use server";

import { revalidatePath } from "next/cache";
import { saveOnce } from "@/lib/form-submissions";
import { isUuid } from "@/lib/ids";
import { checkRequestId } from "@/lib/request-rules";
import { reversePurchaseInTx } from "@/lib/reversals";
import { requireAdmin } from "@/lib/session";

export type ReverseResult = { ok: true } | { ok: false; error: string };

/**
 * Admin only (owner decision D3): take (some of) a wrong purchase out again, with a reason. The supplier
 * is owed bags x the invoice cost less. Rules in lib/reversal-rules.ts, writes in lib/reversals.ts.
 * `requestId` is the sheet's one-time id: a second tap reverses nothing more (request-rules.ts).
 */
export async function reversePurchase(input: {
  /** The purchase's stock movement. */
  movementId: string;
  bags: number;
  reasonCode: string;
  note: string;
  requestId: string;
}): Promise<ReverseResult> {
  const session = await requireAdmin();
  if (!isUuid(input?.movementId)) return { ok: false, error: "Purchase not found." };
  const request = checkRequestId(input.requestId);
  if (!request.ok) return request;
  const actor = { id: session.user.id, role: session.user.role };
  const res = await saveOnce({ id: request.id, kind: "purchase_reversal", actorId: actor.id }, async (tx) => {
    const done = await reversePurchaseInTx(tx, {
      movementId: input.movementId,
      bags: input.bags,
      reasonCode: input.reasonCode,
      note: input.note,
      actor,
    });
    return done.ok ? { ok: true, resultId: done.movementId } : done;
  });
  if (!res.ok) return res;
  revalidatePath("/stock");
  revalidatePath("/stock/purchases");
  revalidatePath("/suppliers", "layout");
  revalidatePath("/dashboard");
  return { ok: true };
}
