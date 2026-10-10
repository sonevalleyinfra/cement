"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { user, walletMovements } from "@/db/schema";
import { isUuid } from "@/lib/ids";
import { notifyMoney } from "@/lib/notify";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { canAnswerRequest, canConfirmHandover, validateHandoverRequest, walletBalance } from "@/lib/wallet-rules";

export type WalletResult = { ok: true } | { ok: false; error: string };

/** The collector says how much of their cash they are handing over. Goes to accounts to confirm. */
export async function requestHandover(input: { amountPaise: number }): Promise<WalletResult> {
  const session = await requireRole(...rolesFor("useWallet"));
  const res = await db.transaction(async (tx): Promise<WalletResult> => {
    // Lock the collector's row so two requests cannot use the same cash.
    await tx.select({ id: user.id }).from(user).where(eq(user.id, session.user.id)).for("no key update");
    const rows = await tx.select().from(walletMovements).where(eq(walletMovements.collectorId, session.user.id));
    const check = validateHandoverRequest(input.amountPaise, walletBalance(rows).availablePaise);
    if (!check.ok) return check;
    await tx.insert(walletMovements).values({
      collectorId: session.user.id,
      kind: "handover_request",
      amountPaise: input.amountPaise,
      actorId: session.user.id,
    });
    return { ok: true };
  });
  if (res.ok) revalidatePath("/wallet");
  return res;
}

/** Accounts or admin confirm (or refuse) one handover request. Confirming clears that much from the wallet. */
export async function answerHandover(requestId: string, confirm: boolean): Promise<WalletResult> {
  const session = await requireRole(...rolesFor("confirmHandover"));
  if (!isUuid(requestId)) return { ok: false, error: "Handover not found." };
  const res = await db.transaction(async (tx): Promise<WalletResult> => {
    const [request] = await tx
      .select()
      .from(walletMovements)
      .where(and(eq(walletMovements.id, requestId), eq(walletMovements.kind, "handover_request")))
      .for("no key update");
    if (!request) return { ok: false, error: "Handover not found." };
    const allowed = canConfirmHandover(session.user.role, session.user.id, request.collectorId);
    if (!allowed.ok) return allowed;
    const answers = await tx
      .select({ id: walletMovements.id })
      .from(walletMovements)
      .where(
        and(
          eq(walletMovements.refId, request.id),
          inArray(walletMovements.kind, ["handover_confirmed", "handover_rejected"]),
        ),
      );
    const once = canAnswerRequest(answers.length > 0);
    if (!once.ok) return once;
    await tx.insert(walletMovements).values({
      collectorId: request.collectorId,
      kind: confirm ? "handover_confirmed" : "handover_rejected",
      amountPaise: confirm ? request.amountPaise : 0,
      refId: request.id,
      actorId: session.user.id,
    });
    await notifyMoney(tx, {
      event: confirm ? "handover_confirmed" : "handover_rejected",
      amountPaise: request.amountPaise,
      actorId: session.user.id,
      collectorId: request.collectorId,
      link: "/wallet",
    });
    return { ok: true };
  });
  if (res.ok) revalidatePath("/wallet");
  return res;
}
