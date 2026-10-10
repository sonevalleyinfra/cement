"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getFirmSelection } from "@/components/app/firm-switcher";
import { db } from "@/db";
import { products, stockMovements } from "@/db/schema";
import {
  adjustmentMovement,
  canSetOpening,
  inMovement,
  parsePlaceKey,
  placeKey,
  transferMovements,
  type Movement,
  type PlaceRef,
} from "@/lib/stock-rules";
import { isUuid } from "@/lib/ids";
import { rolesFor } from "@/lib/permissions";
import { requireFirm, requireRole, writeBlock } from "@/lib/session";
import { getLocation, type Tx } from "@/lib/stock-places";

export type StockResult = { ok: true } | { ok: false; error: string };

export type StockInput = {
  firmId: string;
  productId: string;
  /** The godown or vehicle, as a place key from the drop-down ("godown:<id>" / "vehicle:<id>"). */
  place: string;
  bags: number;
  /** Supplier / note for a purchase, or the reason for an adjustment. */
  note: string;
};

/** Thrown inside a transaction to undo everything in it (e.g. a stock row made a moment ago). */
class Refused extends Error {
  constructor(readonly result: { ok: false; error: string }) {
    super(result.error);
  }
}

/** Runs `fn` in a transaction; when it answers "no", nothing it wrote is kept. */
async function inTransaction(fn: (tx: Tx) => Promise<StockResult>): Promise<StockResult> {
  try {
    return await db.transaction(async (tx) => {
      const res = await fn(tx);
      if (!res.ok) throw new Refused(res);
      return res;
    });
  } catch (e) {
    if (e instanceof Refused) return e.result;
    throw e;
  }
}

/** Admin only, and one firm picked (not "All firms"). */
async function prepare(input: StockInput) {
  const session = await requireRole(...rolesFor("manageStock"));
  const place = parsePlaceKey(input.place);
  if (!isUuid(input.firmId) || !isUuid(input.productId) || !place) {
    return { error: "Pick a product and a place.", session: null, place: null } as const;
  }
  await requireFirm(input.firmId);
  const { selection } = await getFirmSelection();
  if (selection.mode !== "firm" || selection.firmId !== input.firmId) {
    return { error: "Pick one firm first.", session: null, place: null } as const;
  }
  return { error: null, session, place } as const;
}

/** This firm's stock row at the place (made if needed, locked), and the product must be active. */
async function locate(tx: Tx, firmId: string, productId: string, place: PlaceRef) {
  const loc = await getLocation(tx, firmId, place);
  if (!loc.ok) return loc;
  // Share-locked so the product cannot be switched off while its bags arrive.
  const [product] = await tx.select().from(products).where(eq(products.id, productId)).for("share");
  if (!product || !product.active) return { ok: false, error: "Pick an active product." } as const;
  return loc;
}

async function currentMovements(tx: Tx, key: { firmId: string; productId: string; locationId: string }): Promise<Movement[]> {
  // Only the rows for this exact firm + product + place, as plain movements for the rules.
  const rows = await tx
    .select({ type: stockMovements.type, bags: stockMovements.bags })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.firmId, key.firmId),
        eq(stockMovements.productId, key.productId),
        eq(stockMovements.locationId, key.locationId),
      ),
    );
  return rows.map((r) => ({ ...key, type: r.type as Movement["type"], bags: r.bags }));
}

function done(): StockResult {
  revalidatePath("/stock");
  revalidatePath("/dispatch");
  return { ok: true };
}

export async function recordPurchase(input: StockInput): Promise<StockResult> {
  const p = await prepare(input);
  if (p.error !== null) return { ok: false, error: p.error };
  const note = String(input.note ?? "").trim().slice(0, 200);
  const res = await inTransaction(async (tx) => {
    const loc = await locate(tx, input.firmId, input.productId, p.place);
    if (!loc.ok) return loc;
    const key = { firmId: input.firmId, productId: input.productId, locationId: loc.locationId };
    const m = inMovement("purchase", key, input.bags, note);
    if (!m.ok) return m;
    await tx.insert(stockMovements).values({ ...m.movement, reason: m.movement.reason ?? "", actorId: p.session.user.id });
    return { ok: true };
  });
  return res.ok ? done() : res;
}

export async function recordOpening(input: StockInput): Promise<StockResult> {
  const p = await prepare(input);
  if (p.error !== null) return { ok: false, error: p.error };
  const res = await inTransaction(async (tx) => {
    const loc = await locate(tx, input.firmId, input.productId, p.place);
    if (!loc.ok) return loc;
    const key = { firmId: input.firmId, productId: input.productId, locationId: loc.locationId };
    const m = inMovement("opening", key, input.bags, "Opening stock");
    if (!m.ok) return m;
    const once = canSetOpening(await currentMovements(tx, key), key);
    if (!once.ok) return once;
    await tx.insert(stockMovements).values({ ...m.movement, reason: m.movement.reason ?? "", actorId: p.session.user.id });
    return { ok: true };
  });
  return res.ok ? done() : res;
}

/** `bags` is signed here: negative removes bags. */
export async function recordAdjustment(input: StockInput): Promise<StockResult> {
  const p = await prepare(input);
  if (p.error !== null) return { ok: false, error: p.error };
  const res = await inTransaction(async (tx) => {
    const loc = await locate(tx, input.firmId, input.productId, p.place);
    if (!loc.ok) return loc;
    const key = { firmId: input.firmId, productId: input.productId, locationId: loc.locationId };
    const m = adjustmentMovement(
      await currentMovements(tx, key),
      key,
      input.bags,
      String(input.note ?? ""),
      p.session.user.role,
    );
    if (!m.ok) return m;
    await tx.insert(stockMovements).values({ ...m.movement, reason: m.movement.reason ?? "", actorId: p.session.user.id });
    return { ok: true };
  });
  return res.ok ? done() : res;
}

export type TransferInput = {
  firmId: string;
  productId: string;
  /** Place keys, as in StockInput. */
  from: string;
  to: string;
  bags: number;
  note: string;
};

/** Moves bags between two places of ONE firm (leftovers to the godown, loading a truck). */
export async function transferStock(input: TransferInput): Promise<StockResult> {
  const session = await requireRole(...rolesFor("transferStock"));
  const from = parsePlaceKey(input.from);
  const to = parsePlaceKey(input.to);
  if (!isUuid(input.firmId) || !isUuid(input.productId) || !from || !to) {
    return { ok: false, error: "Pick a product and two places." };
  }
  if (placeKey(from) === placeKey(to)) return { ok: false, error: "Pick two different places." };
  await requireFirm(input.firmId);
  const blocked = await writeBlock();
  if (blocked) return { ok: false, error: blocked };
  const { selection } = await getFirmSelection();
  if (selection.mode !== "firm" || selection.firmId !== input.firmId) {
    return { ok: false, error: "Pick one firm first." };
  }
  const note = String(input.note ?? "").trim().slice(0, 200);
  const res = await inTransaction(async (tx) => {
    // Lock both places in a fixed order (sorted keys) so two moves cannot wait on each other.
    const ids = new Map<string, string>();
    for (const place of [from, to].sort((a, b) => placeKey(a).localeCompare(placeKey(b)))) {
      const loc = await getLocation(tx, input.firmId, place);
      if (loc.ok) ids.set(placeKey(place), loc.locationId);
    }
    const fromId = ids.get(placeKey(from));
    const toId = ids.get(placeKey(to));
    if (!fromId || !toId) return { ok: false, error: "Pick two active places." };
    const [product] = await tx.select().from(products).where(eq(products.id, input.productId)).for("share");
    if (!product || !product.active) return { ok: false, error: "Pick an active product." };
    const fromKey = { firmId: input.firmId, productId: input.productId, locationId: fromId };
    const plan = transferMovements(await currentMovements(tx, fromKey), fromKey, toId, input.bags, note);
    if (!plan.ok) return plan;
    await tx
      .insert(stockMovements)
      .values(plan.movements.map((m) => ({ ...m, reason: m.reason ?? "", actorId: session.user.id })));
    return { ok: true };
  });
  return res.ok ? done() : res;
}
