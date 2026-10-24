/**
 * Server-only. Reversing a dispatch (all of a load, or bags returned) and reversing a purchase (cement v2 B2,
 * owner decision D3: admin only, any time, reason required). Rules in lib/reversal-rules.ts; this file reads
 * the facts after the locks and writes the new rows. The books stay append-only: nothing is edited.
 *
 * A dispatch reversal writes: a `dispatches` row with minus the bags (reverses_dispatch_id = the load; its
 * from_* columns = the place the bags go back into), a `return` stock movement (+ bags there), a
 * `dispatch_reversal` ledger credit (minus bags x the load's rate), an order history row ("Returned N bags
 * in <truck>: <reason>", so the books check I12 treats it like a load row), the order's new status, and
 * one activity row (dispatch / reverse).
 * A purchase reversal writes: a `purchase_reversal` stock movement (minus bags, the purchase's place and
 * cost per bag), a `purchase_reversal` supplier entry (minus bags x the INVOICE cost, dated today in India,
 * the invoice no as reference) and one activity row (stock / purchase_reversal). A header's short / burst
 * claim is untouched.
 *
 * Lock order (checked against dispatch/actions.ts and stock/actions.ts):
 * - Dispatch reversal: ORDER row (`for no key update`) → the original DISPATCH row (`for update`) → the
 *   PLACE the bags go back into (lockPlace). dispatchOrder takes order → place, so both queue on the order
 *   first and never cross. Ledger and stock inserts only key-share-lock the shop and product, which never
 *   waits on approval's `for no key update` on the shop (approval: retailer → order; we never lock the shop).
 * - Purchase reversal: PLACE (lockPlace) → the purchase MOVEMENT (`for update`). Purchases, openings and
 *   adjustments lock their place first too (then share-lock the product); transfers lock both places in
 *   key order; nothing else locks a purchase movement, so there is no cycle.
 * - The DB triggers in drizzle/0043 lock the original dispatch / movement again (`FOR UPDATE`, already held
 *   here) and refuse reversing more than the load or the bags received, even for a caller that skips this file.
 *
 * Takes the open transaction and never imports `@/db` or `@/env`, so the DB test (reversals.db.test.ts)
 * can run it on its own pool.
 */
import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import {
  dispatches,
  ledgerEntries,
  orderEvents,
  orders,
  products,
  purchases,
  stockMovements,
  supplierLedgerEntries,
  vehicles,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { toISTDateKey } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { planDispatchReversal, planPurchaseReversal } from "@/lib/reversal-rules";
import { atPlace, lockPlace } from "@/lib/stock-place-lock";
import { placeColumns, placeKey, type PlaceRef } from "@/lib/stock-rules";
import { bagsText } from "@/lib/words";

/** An open transaction (or a database) on the app's schema. */
export type ReversalTx = Pick<PostgresJsDatabase<typeof schema>, "select" | "insert" | "update">;

export type Actor = { id: string; role: string | null | undefined };
type Refusal = { ok: false; error: string };

const sumBags = sql<number>`coalesce(sum(${dispatches.bags}), 0)`.mapWith(Number);

/** Admin reverses `bags` of one load; they go back into `toPlace`. Answers the new reversal row's id. */
export async function reverseDispatchInTx(
  tx: ReversalTx,
  input: { dispatchId: string; bags: unknown; toPlace: PlaceRef; reasonCode: unknown; note: unknown; actor: Actor },
): Promise<{ ok: true; reversalId: string; orderId: string } | Refusal> {
  const { actor } = input;
  if (!can(actor.role, "reverseStock")) return { ok: false, error: "Only an admin can reverse a dispatch." };

  // Lock order: order → dispatch → place (see the header). The order id is read first without a lock.
  const [ref] = await tx.select({ orderId: dispatches.orderId }).from(dispatches).where(eq(dispatches.id, input.dispatchId));
  if (!ref) return { ok: false, error: "Load not found." };
  const [order] = await tx.select().from(orders).where(eq(orders.id, ref.orderId)).for("no key update");
  if (!order) return { ok: false, error: "Order not found." };
  const [load] = await tx.select().from(dispatches).where(eq(dispatches.id, input.dispatchId)).for("update");
  if (!load || load.orderId !== order.id) return { ok: false, error: "Load not found." };
  const place = await lockPlace(tx, input.toPlace);
  if (!place.ok) return { ok: false, error: "Pick an active place." };

  const [done] = await tx
    .select({ bags: sql<number>`coalesce(sum(-${dispatches.bags}), 0)`.mapWith(Number) })
    .from(dispatches)
    .where(eq(dispatches.reversesDispatchId, load.id));
  const [sent] = await tx.select({ bags: sumBags }).from(dispatches).where(eq(dispatches.orderId, order.id));
  const plan = planDispatchReversal({
    role: actor.role,
    order: { status: order.status, bags: order.bags },
    dispatch: { bags: load.bags, ratePaise: load.ratePaise, reversesDispatchId: load.reversesDispatchId },
    reversedBags: done?.bags ?? 0,
    netSentBags: sent?.bags ?? 0,
    bags: input.bags,
    reasonCode: input.reasonCode,
    note: input.note,
  });
  if (!plan.ok) return plan;
  const bags = input.bags as number;

  const [truck] = await tx.select({ number: vehicles.number }).from(vehicles).where(eq(vehicles.id, load.vehicleId));
  const back = placeColumns(placeKey(input.toPlace));
  const [row] = await tx
    .insert(dispatches)
    .values({
      orderId: order.id,
      bags: -bags,
      vehicleId: load.vehicleId,
      driverName: load.driverName,
      driverPhone: load.driverPhone,
      fromGodownId: back.godownId,
      fromVehicleId: back.vehicleId,
      ratePaise: load.ratePaise,
      salesRepId: load.salesRepId,
      dispatchedBy: actor.id,
      reversesDispatchId: load.id,
      reasonCode: plan.code,
      reasonNote: plan.note,
    })
    .returning({ id: dispatches.id });
  await tx.insert(stockMovements).values({
    productId: order.productId,
    ...back,
    type: "return",
    bags,
    orderId: order.id,
    dispatchId: row.id,
    reason: plan.reasonText.slice(0, 200),
    reasonCode: plan.code,
    actorId: actor.id,
  });
  await tx.insert(ledgerEntries).values({
    retailerId: order.retailerId,
    kind: "dispatch_reversal",
    amountPaise: plan.creditPaise,
    orderId: order.id,
    dispatchId: row.id,
    note: `Returned ${bagsText(bags)}: ${plan.reasonText}`.slice(0, 300),
    actorId: actor.id,
  });
  await tx.insert(orderEvents).values({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: plan.newStatus,
    actorId: actor.id,
    // "bags in" like a load row, so the books check I12 matches it to the dispatch's activity row.
    reason: `Returned ${bags} bags in ${truck?.number ?? "truck"}: ${plan.reasonText}`.slice(0, 300),
    reasonCode: plan.code,
  });
  await tx.update(orders).set({ status: plan.newStatus, updatedAt: new Date() }).where(eq(orders.id, order.id));
  await writeAudit(tx, {
    actorId: actor.id,
    entity: "dispatch",
    entityId: row.id,
    action: "reverse",
    details: {
      orderId: order.id,
      retailerId: order.retailerId,
      productId: order.productId,
      bags,
      ratePaise: load.ratePaise,
      amountPaise: plan.creditPaise,
      to: placeKey(input.toPlace),
      reversesDispatchId: load.id,
      reasonCode: plan.code,
      ...(plan.note ? { note: plan.note } : {}),
    },
  });
  return { ok: true, reversalId: row.id, orderId: order.id };
}

/** Admin takes `bags` of one purchase out again (same place). Answers the new movement's id. */
export async function reversePurchaseInTx(
  tx: ReversalTx,
  input: { movementId: string; bags: unknown; reasonCode: unknown; note: unknown; actor: Actor; now?: Date },
): Promise<{ ok: true; movementId: string } | Refusal> {
  const { actor } = input;
  if (!can(actor.role, "reverseStock")) return { ok: false, error: "Only an admin can reverse a purchase." };

  // Lock order: place → movement (see the header). The place is read first without a lock.
  const [ref] = await tx
    .select({ type: stockMovements.type, godownId: stockMovements.godownId, vehicleId: stockMovements.vehicleId })
    .from(stockMovements)
    .where(eq(stockMovements.id, input.movementId));
  if (!ref || ref.type !== "purchase") return { ok: false, error: "Purchase not found." };
  const where: PlaceRef = ref.godownId ? { kind: "godown", id: ref.godownId } : { kind: "vehicle", id: ref.vehicleId as string };
  const place = await lockPlace(tx, where);
  if (!place.ok) return { ok: false, error: "The place of this purchase is switched off." };
  const [m] = await tx.select().from(stockMovements).where(eq(stockMovements.id, input.movementId)).for("update");
  if (!m) return { ok: false, error: "Purchase not found." };

  const [header] = await tx
    .select({ receivedBags: purchases.receivedBags, invoiceNo: purchases.invoiceNo })
    .from(purchases)
    .where(eq(purchases.stockMovementId, m.id));
  const [done] = await tx
    .select({ bags: sql<number>`coalesce(sum(-${stockMovements.bags}), 0)`.mapWith(Number) })
    .from(stockMovements)
    .where(and(eq(stockMovements.reversesMovementId, m.id), eq(stockMovements.type, "purchase_reversal")));
  const [stock] = await tx
    .select({ bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number) })
    .from(stockMovements)
    .where(and(eq(stockMovements.productId, m.productId), atPlace(where)));
  const plan = planPurchaseReversal({
    role: actor.role,
    purchase: { type: m.type, bags: m.bags, receivedBags: header?.receivedBags ?? null, unitCostPaise: m.unitCostPaise },
    reversedBags: done?.bags ?? 0,
    stockAtPlace: stock?.bags ?? 0,
    placeName: place.name,
    bags: input.bags,
    reasonCode: input.reasonCode,
    note: input.note,
  });
  if (!plan.ok) return plan;
  const bags = input.bags as number;
  const [product] = await tx.select({ brandId: products.brandId }).from(products).where(eq(products.id, m.productId));
  if (!product) return { ok: false, error: "Purchase not found." };

  const [moved] = await tx
    .insert(stockMovements)
    .values({
      productId: m.productId,
      godownId: m.godownId,
      vehicleId: m.vehicleId,
      type: "purchase_reversal",
      bags: -bags,
      reason: plan.reasonText.slice(0, 200),
      reasonCode: plan.code,
      unitCostPaise: m.unitCostPaise,
      reversesMovementId: m.id,
      actorId: actor.id,
    })
    .returning({ id: stockMovements.id });
  await tx.insert(supplierLedgerEntries).values({
    brandId: product.brandId,
    kind: "purchase_reversal",
    amountPaise: plan.supplierPaise,
    entryDate: toISTDateKey(input.now ?? new Date()),
    stockMovementId: moved.id,
    mode: null,
    reference: header?.invoiceNo ?? "",
    note: plan.reasonText.slice(0, 300),
    actorId: actor.id,
  });
  await writeAudit(tx, {
    actorId: actor.id,
    entity: "stock",
    entityId: moved.id,
    action: "purchase_reversal",
    details: {
      productId: m.productId,
      bags: -bags,
      place: placeKey(where),
      unitCostPaise: m.unitCostPaise,
      amountPaise: plan.supplierPaise,
      brandId: product.brandId,
      reversesMovementId: m.id,
      ...(header ? { invoiceNo: header.invoiceNo } : {}),
      reasonCode: plan.code,
      ...(plan.note ? { note: plan.note } : {}),
    },
  });
  return { ok: true, movementId: moved.id };
}
