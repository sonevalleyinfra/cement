"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { user, walletMovements } from "@/db/schema";
import { findAccessibleFirm } from "@/lib/firm-access";
import { isUuid } from "@/lib/ids";
import { rolesFor } from "@/lib/permissions";
import { requireRole, writeBlock } from "@/lib/session";
import { canAnswerRequest, canConfirmHandover, validateHandoverRequest, walletBalance } from "@/lib/wallet-rules";

export type WalletResult = { ok: true } | { ok: false; error: string };

/** The collector says how much cash of one firm they are handing over. Goes to accounts to confirm. */
export async function requestHandover(input: { firmId: string; amountPaise: number }): Promise<WalletResult> {
  const session = await requireRole(...rolesFor("useWallet"));
  const blocked = await writeBlock();
  if (blocked) return { ok: false, error: blocked };
  if (!isUuid(input.firmId)) return { ok: false, error: "You cannot work on this firm." };
  const firm = await findAccessibleFirm(session.user.id, session.user.role, input.firmId);
  if (!firm) return { ok: false, error: "You cannot work on this firm." };

  const res = await db.transaction(async (tx): Promise<WalletResult> => {
    // Lock the collector's row so two requests cannot use the same cash.
    await tx.select({ id: user.id }).from(user).where(eq(user.id, session.user.id)).for("update");
    const rows = await tx
      .select()
      .from(walletMovements)
      .where(and(eq(walletMovements.collectorId, session.user.id), eq(walletMovements.firmId, input.firmId)));
    const check = validateHandoverRequest(input.amountPaise, walletBalance(rows).availablePaise);
    if (!check.ok) return check;
    await tx.insert(walletMovements).values({
      firmId: input.firmId,
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
  const blocked = await writeBlock();
  if (blocked) return { ok: false, error: blocked };
  if (!isUuid(requestId)) return { ok: false, error: "Handover not found." };
  const res = await db.transaction(async (tx): Promise<WalletResult> => {
    const [request] = await tx
      .select()
      .from(walletMovements)
      .where(and(eq(walletMovements.id, requestId), eq(walletMovements.kind, "handover_request")))
      .for("update");
    if (!request) return { ok: false, error: "Handover not found." };
    const firm = await findAccessibleFirm(session.user.id, session.user.role, request.firmId);
    if (!firm) return { ok: false, error: "You cannot work on this firm." };
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
      firmId: request.firmId,
      collectorId: request.collectorId,
      kind: confirm ? "handover_confirmed" : "handover_rejected",
      amountPaise: confirm ? request.amountPaise : 0,
      refId: request.id,
      actorId: session.user.id,
    });
    return { ok: true };
  });
  if (res.ok) revalidatePath("/wallet");
  return res;
}
