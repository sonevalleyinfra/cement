"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getFirmSelection } from "@/components/app/firm-switcher";
import { db } from "@/db";
import { brands, cementTypes, grades, products, stockMovements } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { DEFAULT_BAG_KG, isProductChannel, resolveProduct } from "@/lib/catalogue-rules";
import {
  adjustmentMovement,
  canSetOpening,
  inMovement,
  NEW_TRUCK_PLACE,
  parsePlaceKey,
  placeKey,
  transferMovements,
  type Movement,
  type PlaceRef,
} from "@/lib/stock-rules";
import { isUuid } from "@/lib/ids";
import { can, rolesFor } from "@/lib/permissions";
import { requireFirm, requireRole, writeBlock } from "@/lib/session";
import { getLocation, truckByNumber, type Tx } from "@/lib/stock-places";
import { checkTruck, truckNote, type Truck } from "@/lib/vehicle-rules";

export type StockResult = { ok: true } | { ok: false; error: string };

export type StockInput = {
  firmId: string;
  /** The product, picked as its parts: brand, trade-type (channel), cement type and grade. */
  brandId: string;
  channel: string;
  typeId: string;
  gradeId: string;
  /**
   * The godown or truck, as a place key from the drop-down ("godown:<id>" / "vehicle:<id>"),
   * or `NEW_TRUCK_PLACE` for a purchase into a truck typed in `truck`.
   */
  place: string;
  /** The quick truck form, used when `place` is `NEW_TRUCK_PLACE`. */
  truck?: { number: string; driverName: string; driverPhone: string };
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

/** Admin only, and one firm picked (not "All firms"). Only a purchase may use a typed-in truck. */
async function prepare(input: StockInput, allowNewTruck = false) {
  const session = await requireRole(...rolesFor("manageStock"));
  const place = allowNewTruck && input.place === NEW_TRUCK_PLACE ? NEW_TRUCK_PLACE : parsePlaceKey(input.place);
  const partsOk =
    isUuid(input.brandId) && isProductChannel(input.channel) && isUuid(input.typeId) && isUuid(input.gradeId);
  if (!isUuid(input.firmId) || !partsOk || !place) {
    return { error: "Pick a product and a place.", session: null, place: null } as const;
  }
  await requireFirm(input.firmId);
  const { selection } = await getFirmSelection();
  if (selection.mode !== "firm" || selection.firmId !== input.firmId) {
    return { error: "Pick one firm first.", session: null, place: null } as const;
  }
  return { error: null, session, place } as const;
}

/**
 * The product the four drop-downs point to. With `allowCreate` (a purchase by someone who may manage
 * the catalogue) a missing product is added, or a switched-off one switched back on, in the same transaction.
 */
async function pickProduct(
  tx: Tx,
  input: StockInput,
  actorId: string,
  allowCreate: boolean,
): Promise<{ ok: true; productId: string } | { ok: false; error: string }> {
  // Locked so two purchases cannot add the same product at once.
  if (allowCreate) await tx.execute(sql`lock table ${products} in share row exclusive mode`);
  const [b, t, g, p] = await Promise.all([
    tx.select({ id: brands.id, name: brands.name, active: brands.active }).from(brands),
    tx.select({ id: cementTypes.id, code: cementTypes.code, active: cementTypes.active }).from(cementTypes),
    tx.select({ id: grades.id, typeId: grades.typeId, name: grades.name, active: grades.active }).from(grades),
    tx
      .select({
        id: products.id,
        brandId: products.brandId,
        channel: products.channel,
        gradeId: products.gradeId,
        bagKg: products.bagKg,
        active: products.active,
      })
      .from(products),
  ]);
  const parts = { brandId: input.brandId, channel: input.channel, typeId: input.typeId, gradeId: input.gradeId, bagKg: DEFAULT_BAG_KG };
  const r = resolveProduct(parts, { brands: b, types: t, grades: g, products: p }, allowCreate);
  if (!r.ok) return r;
  if (r.kind === "existing") return { ok: true, productId: r.id };
  if (r.kind === "reactivate") {
    await tx.update(products).set({ active: true, updatedAt: new Date() }).where(eq(products.id, r.id));
    await writeAudit(tx, { actorId, entity: "product", entityId: r.id, action: "activate", details: { from: "purchase" } });
    return { ok: true, productId: r.id };
  }
  const [row] = await tx.insert(products).values(r.value).returning({ id: products.id });
  await writeAudit(tx, { actorId, entity: "product", entityId: row.id, action: "create", details: { ...r.value, from: "purchase" } });
  return { ok: true, productId: row.id };
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
  // A purchase may have added a product.
  revalidatePath("/catalogue");
  revalidatePath("/orders/new");
  return { ok: true };
}

export async function recordPurchase(input: StockInput): Promise<StockResult> {
  const p = await prepare(input, true);
  if (p.error !== null) return { ok: false, error: p.error };
  let note = String(input.note ?? "").trim().slice(0, 200);
  let truck: Truck | null = null;
  if (p.place === NEW_TRUCK_PLACE) {
    const check = checkTruck(input.truck ?? {});
    if (!check.ok) return check;
    truck = check.value;
    note = truckNote(note, truck);
  }
  const chosen = p.place;
  const allowCreate = can(p.session.user.role, "manageCatalogue");
  const res = await inTransaction(async (tx) => {
    const picked = await pickProduct(tx, input, p.session.user.id, allowCreate);
    if (!picked.ok) return picked;
    // A typed-in truck is found (or made) by its number, so the same truck always lands on the same stock row.
    const place: PlaceRef =
      chosen === NEW_TRUCK_PLACE
        ? { kind: "vehicle", id: await truckByNumber(tx, truck?.number ?? "", p.session.user.id) }
        : chosen;
    const loc = await locate(tx, input.firmId, picked.productId, place);
    if (!loc.ok) return loc;
    const key = { firmId: input.firmId, productId: picked.productId, locationId: loc.locationId };
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
  const place = p.place;
  if (place === NEW_TRUCK_PLACE) return { ok: false, error: "Pick a product and a place." };
  const res = await inTransaction(async (tx) => {
    const picked = await pickProduct(tx, input, p.session.user.id, false);
    if (!picked.ok) return picked;
    const loc = await locate(tx, input.firmId, picked.productId, place);
    if (!loc.ok) return loc;
    const key = { firmId: input.firmId, productId: picked.productId, locationId: loc.locationId };
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
  const place = p.place;
  if (place === NEW_TRUCK_PLACE) return { ok: false, error: "Pick a product and a place." };
  const res = await inTransaction(async (tx) => {
    const picked = await pickProduct(tx, input, p.session.user.id, false);
    if (!picked.ok) return picked;
    const loc = await locate(tx, input.firmId, picked.productId, place);
    if (!loc.ok) return loc;
    const key = { firmId: input.firmId, productId: picked.productId, locationId: loc.locationId };
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
