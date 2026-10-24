/**
 * Server-only. Approving an order with the credit check (v2 B1, owner decision D2: soft block).
 * The real control is here, inside the transaction, not on the screen: the exposure is read again
 * after the shop's row is locked, and an approval that needs a reason is refused without one.
 *
 * The race: two accounts people approving two orders of one shop at the same moment would each see
 * the shop under its limit. So the approval locks the shop's `retailers` row (`for no key update`,
 * the same lock payments, ledger and shop saves take) and reads every number after the lock. In
 * read committed, each statement after the lock sees what the other approval committed, so the
 * second one counts the first one's order as "not sent".
 *
 * Lock order: retailer row → order row. A shop save (saveShop in retailers/actions.ts) locks the
 * retailer and then moves the shop's open orders to the new sales person, so approval also takes the
 * shop first and then the order (the other way round deadlocked). Dispatch locks the order, then a stock
 * place, and only key-share-locks the retailer (ledger inserts), so it never conflicts; payments lock
 * the payment, then the retailer, then the staff member. Inserting rows that point at an order or a
 * shop only takes a key-share lock, which never waits on `for no key update`.
 *
 * Takes the open transaction and never imports `@/db` or `@/env`, so the race test
 * (order-approval.db.test.ts) can run it on its own pool. The order's usual "approved" notifications
 * (lib/notify.ts) are added by the caller in the same transaction.
 */
import { and, eq, isNull, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { creditOverrides, notifications, orderEvents, orders, retailers, user } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { readCreditFacts } from "@/lib/credit-check-queries";
import { assessCredit, overrideNeededError } from "@/lib/credit-check-rules";
import { toISTDateKey } from "@/lib/datetime";
import { buildCreditOverrideNotifications } from "@/lib/notification-rules";
import { orderTotalPaise } from "@/lib/order-rules";
import { canDecide } from "@/lib/rate-rules";
import { checkReason } from "@/lib/reason-codes";
import { isAdmin } from "@/lib/roles";

/** An open transaction (or a database) on the app's schema. */
export type ApprovalTx = Pick<PostgresJsDatabase<typeof schema>, "select" | "selectDistinctOn" | "insert" | "update">;

export type OverrideInput = { code: unknown; note: unknown } | null;

export type ApproveResult =
  | { ok: true; override: boolean }
  | { ok: false; error: string; needsOverride?: true };

export async function approveOrderInTx(
  tx: ApprovalTx,
  input: {
    orderId: string;
    actor: { id: string; role: string | null | undefined };
    /** The rate on the approver's screen (canDecide). */
    seenRatePaise: unknown;
    /** The reason picked on a red card; ignored when the check is not red. */
    override: OverrideInput;
    now: Date;
  },
): Promise<ApproveResult> {
  const { orderId, actor } = input;
  // Lock order: retailer, then order (see the header). The shop id is read first without a lock.
  const [ref] = await tx.select({ retailerId: orders.retailerId }).from(orders).where(eq(orders.id, orderId));
  if (!ref) return { ok: false, error: "Order not found." };
  const [shop] = await tx
    .select({ id: retailers.id, name: retailers.name })
    .from(retailers)
    .where(eq(retailers.id, ref.retailerId))
    .for("no key update");
  if (!shop) return { ok: false, error: "Retailer not available." };
  const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("no key update");
  if (!o) return { ok: false, error: "Order not found." };
  if (o.retailerId !== shop.id) return { ok: false, error: "Order changed. Reload and try again." };
  const allowed = canDecide(actor.role, o, "approved", input.seenRatePaise);
  if (!allowed.ok) return allowed;

  const facts = (await readCreditFacts(tx, [shop.id], toISTDateKey(input.now))).get(shop.id);
  if (!facts) return { ok: false, error: "Retailer not available." };
  const credit = assessCredit(facts, orderTotalPaise(o.bags, o.ratePaise as number));

  let why: { code: string; note: string } | null = null;
  if (credit.needsOverride) {
    if (!input.override) return { ok: false, error: overrideNeededError(credit.flags), needsOverride: true };
    const check = checkReason("override", input.override.code, input.override.note);
    if (!check.ok) return { ok: false, error: check.error, needsOverride: true };
    why = { code: check.code, note: check.note };
  }

  await tx.update(orders).set({ status: "approved", updatedAt: input.now }).where(eq(orders.id, orderId));
  await tx.insert(orderEvents).values({
    orderId,
    fromStatus: o.status,
    toStatus: "approved",
    actorId: actor.id,
    reason: why?.note ?? "",
    reasonCode: why?.code ?? null,
  });
  if (why) {
    await tx.insert(creditOverrides).values({
      orderId,
      retailerId: shop.id,
      actorId: actor.id,
      reasonCode: why.code,
      note: why.note,
      orderPaise: credit.thisOrderPaise,
      afterPaise: credit.afterPaise,
      limitPaise: credit.limitPaise,
      overLimitPaise: credit.overLimitPaiseApproved,
      oldestOverdueDays: credit.oldestOverdueDays,
      creditDays: credit.creditDays,
      creditStatus: credit.status,
    });
  }
  await writeAudit(tx, {
    actorId: actor.id,
    entity: "order",
    entityId: orderId,
    action: "approve",
    details: {
      retailerId: o.retailerId,
      productId: o.productId,
      bags: o.bags,
      ratePaise: o.ratePaise,
      ...(why
        ? {
            override: true,
            reasonCode: why.code,
            ...(why.note ? { note: why.note } : {}),
            afterPaise: credit.afterPaise,
            limitPaise: credit.limitPaise,
            overLimitByPaise: credit.overLimitByPaise,
            oldestOverdueDays: credit.oldestOverdueDays,
          }
        : {}),
    },
  });
  if (why) {
    const people = await tx
      .select({ id: user.id, role: user.role })
      .from(user)
      .where(and(isNull(user.deletedAt), or(isNull(user.banned), eq(user.banned, false))));
    const drafts = buildCreditOverrideNotifications({
      retailerName: shop.name,
      flags: credit.flags,
      overLimitByPaise: credit.overLimitByPaise,
      reasonCode: why.code,
      adminIds: people.filter((p) => isAdmin(p.role)).map((p) => p.id),
      actorId: actor.id,
    });
    if (drafts.length > 0) await tx.insert(notifications).values(drafts.map((d) => ({ ...d, orderId })));
  }
  return { ok: true, override: why !== null };
}
