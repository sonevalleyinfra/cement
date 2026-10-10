"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { user, walletMovements } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { claimRequest } from "@/lib/form-submissions";
import { isUuid } from "@/lib/ids";
import { notifyMoney } from "@/lib/notify";
import { rolesFor } from "@/lib/permissions";
import { checkRequestId } from "@/lib/request-rules";
import { requireRole } from "@/lib/session";
import { planHandoverAnswer, validateHandoverRequest, walletBalance, type HandoverAnswer } from "@/lib/wallet-rules";

export type WalletResult = { ok: true } | { ok: false; error: string };

function refresh() {
  revalidatePath("/wallet");
  revalidatePath("/dashboard");
}

/**
 * A staff member asks to hand over some of the cash they hold. Accounts are told.
 * `requestId` is the form's one-time id: a second tap asks nothing more (request-rules.ts).
 */
export async function requestHandover(input: { amountPaise: number; requestId: string }): Promise<WalletResult> {
  const session = await requireRole(...rolesFor("useWallet"));
  const amount = Number(input?.amountPaise);
  const form = checkRequestId(input?.requestId);
  if (!form.ok) return form;
  const res = await db.transaction(async (tx): Promise<WalletResult> => {
    const claim = await claimRequest(tx, form.id, "handover_request", session.user.id);
    if (!claim.fresh) return claim.result.ok ? { ok: true } : claim.result;
    // Lock the staff member's row so two requests (or a reversal) cannot use the same cash.
    await tx.select({ id: user.id }).from(user).where(eq(user.id, session.user.id)).for("no key update");
    const rows = await tx.select().from(walletMovements).where(eq(walletMovements.collectorId, session.user.id));
    const check = validateHandoverRequest(amount, walletBalance(rows).availablePaise);
    if (!check.ok) return check;
    const [request] = await tx
      .insert(walletMovements)
      .values({
        collectorId: session.user.id,
        kind: "handover_request",
        amountPaise: amount,
        actorId: session.user.id,
      })
      .returning({ id: walletMovements.id });
    await writeAudit(tx, {
      actorId: session.user.id,
      entity: "handover",
      entityId: request.id,
      action: "request",
      details: { collectorId: session.user.id, amountPaise: amount },
    });
    await notifyMoney(tx, {
      event: "handover_requested",
      amountPaise: amount,
      actorId: session.user.id,
      collectorId: session.user.id,
      link: "/wallet",
    });
    return { ok: true };
  });
  if (res.ok) refresh();
  return res;
}

/**
 * Accounts or admin answer one handover request: "Received" for the full amount, a smaller
 * amount actually received (the rest stays with the staff member), or reject with a reason.
 */
export async function answerHandover(requestId: string, answer: HandoverAnswer): Promise<WalletResult> {
  const session = await requireRole(...rolesFor("confirmHandover"));
  if (!isUuid(requestId)) return { ok: false, error: "Handover not found." };
  if (answer?.action !== "confirm" && answer?.action !== "reject") return { ok: false, error: "Pick received or reject." };
  const clean: HandoverAnswer =
    answer.action === "confirm"
      ? { action: "confirm", amountPaise: Number(answer.amountPaise) }
      : { action: "reject", reason: answer.reason };
  const res = await db.transaction(async (tx): Promise<WalletResult> => {
    const [request] = await tx
      .select()
      .from(walletMovements)
      .where(and(eq(walletMovements.id, requestId), eq(walletMovements.kind, "handover_request")))
      .for("no key update");
    if (!request) return { ok: false, error: "Handover not found." };
    // Same lock as a new request, so two answers to one request wait for each other.
    await tx.select({ id: user.id }).from(user).where(eq(user.id, request.collectorId)).for("no key update");
    const answers = await tx
      .select({ id: walletMovements.id })
      .from(walletMovements)
      .where(
        and(
          eq(walletMovements.refId, request.id),
          inArray(walletMovements.kind, ["handover_confirmed", "handover_rejected"]),
        ),
      );
    const plan = planHandoverAnswer(session.user.role, session.user.id, request, answers.length > 0, clean);
    if (!plan.ok) return plan;
    await tx.insert(walletMovements).values({
      collectorId: request.collectorId,
      kind: plan.kind,
      amountPaise: plan.amountPaise,
      refId: request.id,
      note: plan.note,
      actorId: session.user.id,
    });
    await writeAudit(tx, {
      actorId: session.user.id,
      entity: "handover",
      entityId: request.id,
      action: plan.kind === "handover_confirmed" ? "confirm" : "reject",
      details: {
        collectorId: request.collectorId,
        amountPaise: plan.kind === "handover_confirmed" ? plan.amountPaise : request.amountPaise,
        requestedPaise: request.amountPaise,
        ...(plan.note ? { reason: plan.note } : {}),
      },
    });
    await notifyMoney(tx, {
      event: plan.kind,
      amountPaise: plan.kind === "handover_confirmed" ? plan.amountPaise : request.amountPaise,
      requestedPaise: request.amountPaise,
      actorId: session.user.id,
      collectorId: request.collectorId,
      link: "/wallet",
      reason: plan.note,
    });
    return { ok: true };
  });
  if (res.ok) refresh();
  return res;
}
