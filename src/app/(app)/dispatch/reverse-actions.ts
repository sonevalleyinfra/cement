"use server";

import { revalidatePath } from "next/cache";
import { saveOnce } from "@/lib/form-submissions";
import { isUuid } from "@/lib/ids";
import { checkRequestId } from "@/lib/request-rules";
import { reverseDispatchInTx } from "@/lib/reversals";
import { requireAdmin } from "@/lib/session";
import { parsePlaceKey } from "@/lib/stock-rules";

export type ReverseResult = { ok: true } | { ok: false; error: string };

/**
 * Admin only (owner decision D3): reverse a load, all of it or the bags the shop sent back, into a godown
 * or truck, with a reason. Rules in lib/reversal-rules.ts, writes in lib/reversals.ts (one transaction).
 * `requestId` is the sheet's one-time id: a second tap reverses nothing more (request-rules.ts).
 */
export async function reverseDispatch(input: {
  dispatchId: string;
  bags: number;
  /** Where the bags go back into: a place key ("godown:<id>" / "vehicle:<id>"). */
  toPlace: string;
  reasonCode: string;
  note: string;
  requestId: string;
}): Promise<ReverseResult> {
  const session = await requireAdmin();
  if (!isUuid(input?.dispatchId)) return { ok: false, error: "Load not found." };
  const request = checkRequestId(input.requestId);
  if (!request.ok) return request;
  const toPlace = parsePlaceKey(input.toPlace);
  if (!toPlace) return { ok: false, error: "Pick where the bags go back." };
  const actor = { id: session.user.id, role: session.user.role };
  let orderId = "";
  const res = await saveOnce({ id: request.id, kind: "dispatch_reversal", actorId: actor.id }, async (tx) => {
    const done = await reverseDispatchInTx(tx, {
      dispatchId: input.dispatchId,
      bags: input.bags,
      toPlace,
      reasonCode: input.reasonCode,
      note: input.note,
      actor,
    });
    if (!done.ok) return done;
    orderId = done.orderId;
    return { ok: true, resultId: done.reversalId };
  });
  if (!res.ok) return res;
  revalidatePath("/dispatch");
  revalidatePath("/orders");
  if (orderId) revalidatePath(`/orders/${orderId}`);
  revalidatePath("/stock");
  revalidatePath("/ledger", "layout");
  revalidatePath("/dashboard");
  return { ok: true };
}
