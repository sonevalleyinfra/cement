"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { grades, products, stockMovements } from "@/db/schema";
import { toISTDateKey } from "@/lib/datetime";
import { formatINR } from "@/lib/money";
import { postSupplierEntry } from "@/lib/suppliers";
import { checkCostPerBag, purchaseEntry } from "@/lib/supplier-rules";
import { writeAudit } from "@/lib/audit";
import { DEFAULT_BAG_KG, isProductChannel, resolveProduct } from "@/lib/catalogue-rules";
import { claimRequest } from "@/lib/form-submissions";
import { checkRequestId, type RequestKind } from "@/lib/request-rules";
import {
  adjustmentMovement,
  canSetOpening,
  checkTransferPlaces,
  inMovement,
  NEW_TRUCK_PLACE,
  parsePlaceKey,
  placeColumns,
  placeKey,
  transferMovements,
  type Movement,
  type PlaceRef,
  type StockKey,
} from "@/lib/stock-rules";
import { isUuid } from "@/lib/ids";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { atPlace, lockPlace, truckByNumber, type Tx } from "@/lib/stock-places";
import { checkTruck, truckNote, type Truck } from "@/lib/vehicle-rules";

export type StockResult = { ok: true } | { ok: false; error: string };

export type StockInput = {
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
  /** Supplier / note for a purchase, or the optional note with an adjustment. */
  note: string;
  /** Adjustment only: why (damage, burst, shortage, count; STOCK_FIX_REASONS). */
  reason?: string;
  /** Purchase only (required): what one bag cost, in paise. */
  costPerBagPaise?: number;
  /** Purchase only (optional): the supplier's invoice number. */
  invoiceNo?: string;
  /** The form's one-time id: a second tap saves nothing more (request-rules.ts). */
  requestId: string;
};

/** Thrown inside a transaction to undo everything in it (e.g. a product or truck made a moment ago). */
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

/** Admin only. Only a purchase may use a typed-in truck. */
async function prepare(input: StockInput, allowNewTruck = false) {
  const session = await requireRole(...rolesFor("manageStock"));
  const request = checkRequestId(input.requestId);
  if (!request.ok) return { error: request.error, session: null, place: null, requestId: null } as const;
  const place = allowNewTruck && input.place === NEW_TRUCK_PLACE ? NEW_TRUCK_PLACE : parsePlaceKey(input.place);
  const partsOk =
    isUuid(input.brandId) && isProductChannel(input.channel) && isUuid(input.typeId) && isUuid(input.gradeId);
  if (!partsOk || !place) {
    return { error: "Pick a product and a place.", session: null, place: null, requestId: null } as const;
  }
  return { error: null, session, place, requestId: request.id } as const;
}

/**
 * Records the form's one-time id in the transaction. Null = go on; otherwise the answer to give
 * (the same form was already saved: nothing more is saved).
 */
async function firstTime(tx: Tx, requestId: string, kind: RequestKind, actorId: string): Promise<StockResult | null> {
  const claim = await claimRequest(tx, requestId, kind, actorId);
  if (claim.fresh) return null;
  return claim.result.ok ? { ok: true } : claim.result;
}

/**
 * The product the drop-downs (brand, trade-type, type, grade) point to. It must already exist
 * (products are added in Catalogue), so a switched brand never makes a new product by mistake.
 */
async function pickProduct(tx: Tx, input: StockInput): Promise<{ ok: true; productId: string } | { ok: false; error: string }> {
  const [g, p] = await Promise.all([
    tx.select({ id: grades.id, typeId: grades.typeId }).from(grades),
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
  const parts = {
    brandId: input.brandId,
    channel: input.channel,
    typeId: input.typeId,
    gradeId: input.gradeId,
    bagKg: DEFAULT_BAG_KG,
  };
  const r = resolveProduct(parts, { grades: g, products: p });
  return r.ok ? { ok: true, productId: r.id } : r;
}

/** Locks the place (it must be active), and the product must be active. Returns the stock key. */
async function locate(tx: Tx, productId: string, place: PlaceRef) {
  const locked = await lockPlace(tx, place);
  if (!locked.ok) return locked;
  // Share-locked so the product cannot be switched off while its bags arrive.
  const [product] = await tx.select().from(products).where(eq(products.id, productId)).for("share");
  if (!product || !product.active) return { ok: false, error: "Pick an active product." } as const;
  return { ok: true, key: { productId, placeKey: placeKey(place) } } as const;
}

async function currentMovements(tx: Tx, key: StockKey): Promise<Movement[]> {
  // Only the rows for this exact product + place, as plain movements for the rules.
  const place = parsePlaceKey(key.placeKey);
  if (!place) return [];
  const rows = await tx
    .select({ type: stockMovements.type, bags: stockMovements.bags })
    .from(stockMovements)
    .where(and(eq(stockMovements.productId, key.productId), atPlace(place)));
  return rows.map((r) => ({ ...key, type: r.type as Movement["type"], bags: r.bags }));
}

/** A movement from the rules as a database row. */
function toRow(m: Movement, actorId: string) {
  return {
    productId: m.productId,
    ...placeColumns(m.placeKey),
    type: m.type,
    bags: m.bags,
    orderId: m.orderId ?? null,
    reason: m.reason ?? "",
    actorId,
  };
}

/** The facts every stock row in the activity log carries. */
function movementFacts(m: Movement) {
  return { productId: m.productId, bags: m.bags, place: m.placeKey };
}

function done(): StockResult {
  revalidatePath("/stock");
  revalidatePath("/dispatch");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * A purchase adds the bags AND what we now owe the supplier of the product's brand (bags x cost per bag),
 * in one transaction: either both are saved or neither. The cost per bag is also kept on the stock movement.
 */
export async function recordPurchase(input: StockInput): Promise<StockResult> {
  const p = await prepare(input, true);
  if (p.error !== null) return { ok: false, error: p.error };
  const cost = checkCostPerBag(input.costPerBagPaise);
  if (!cost.ok) return cost;
  let note = String(input.note ?? "").trim().slice(0, 200);
  let truck: Truck | null = null;
  if (p.place === NEW_TRUCK_PLACE) {
    const check = checkTruck(input.truck ?? {});
    if (!check.ok) return check;
    truck = check.value;
    note = truckNote(note, truck);
  }
  const chosen = p.place;
  const requestId = p.requestId;
  const res = await inTransaction(async (tx) => {
    const again = await firstTime(tx, requestId, "purchase", p.session.user.id);
    if (again) return again;
    const picked = await pickProduct(tx, input);
    if (!picked.ok) return picked;
    // A typed-in truck is found (or made) by its number, so the same truck always has the same stock.
    const place: PlaceRef =
      chosen === NEW_TRUCK_PLACE
        ? { kind: "vehicle", id: await truckByNumber(tx, truck?.number ?? "", p.session.user.id) }
        : chosen;
    const loc = await locate(tx, picked.productId, place);
    if (!loc.ok) return loc;
    const m = inMovement("purchase", loc.key, input.bags, note);
    if (!m.ok) return m;
    const [product] = await tx
      .select({ name: products.name, brandId: products.brandId })
      .from(products)
      .where(eq(products.id, picked.productId));
    if (!product) return { ok: false, error: "Pick an active product." };
    // The amount is owed to the supplier of this product's brand.
    const owed = purchaseEntry(product, m.movement.bags, cost.costPaise, toISTDateKey(new Date()), {
      reference: input.invoiceNo,
      description: `${m.movement.bags} bags ${product.name} at ${formatINR(cost.costPaise)}`.replace(/\s+/g, " "),
    });
    if (!owed.ok) return owed;
    const [moved] = await tx
      .insert(stockMovements)
      .values({ ...toRow(m.movement, p.session.user.id), unitCostPaise: cost.costPaise })
      .returning({ id: stockMovements.id });
    await postSupplierEntry(tx, owed.entry, p.session.user.id, moved.id, { audit: false });
    await writeAudit(tx, {
      actorId: p.session.user.id,
      entity: "stock",
      entityId: moved.id,
      action: "purchase",
      details: {
        ...movementFacts(m.movement),
        unitCostPaise: cost.costPaise,
        amountPaise: owed.entry.amountPaise,
        brandId: owed.entry.brandId,
        ...(owed.entry.reference ? { invoiceNo: owed.entry.reference } : {}),
      },
    });
    return { ok: true };
  });
  if (res.ok) {
    revalidatePath("/suppliers", "layout");
    revalidatePath("/dashboard");
  }
  return res.ok ? done() : res;
}

export async function recordOpening(input: StockInput): Promise<StockResult> {
  const p = await prepare(input);
  if (p.error !== null) return { ok: false, error: p.error };
  const place = p.place;
  const requestId = p.requestId;
  if (place === NEW_TRUCK_PLACE) return { ok: false, error: "Pick a product and a place." };
  const res = await inTransaction(async (tx) => {
    const again = await firstTime(tx, requestId, "opening_stock", p.session.user.id);
    if (again) return again;
    const picked = await pickProduct(tx, input);
    if (!picked.ok) return picked;
    const loc = await locate(tx, picked.productId, place);
    if (!loc.ok) return loc;
    const m = inMovement("opening", loc.key, input.bags, "Opening stock");
    if (!m.ok) return m;
    const once = canSetOpening(await currentMovements(tx, loc.key), loc.key);
    if (!once.ok) return once;
    const [row] = await tx
      .insert(stockMovements)
      .values(toRow(m.movement, p.session.user.id))
      .returning({ id: stockMovements.id });
    await writeAudit(tx, {
      actorId: p.session.user.id,
      entity: "stock",
      entityId: row.id,
      action: "opening",
      details: movementFacts(m.movement),
    });
    return { ok: true };
  });
  return res.ok ? done() : res;
}

/** A stock correction. `bags` is signed here: negative removes bags. `reason` from the list, `note` optional. */
export async function recordAdjustment(input: StockInput): Promise<StockResult> {
  const p = await prepare(input);
  if (p.error !== null) return { ok: false, error: p.error };
  const place = p.place;
  const requestId = p.requestId;
  if (place === NEW_TRUCK_PLACE) return { ok: false, error: "Pick a product and a place." };
  const res = await inTransaction(async (tx) => {
    const again = await firstTime(tx, requestId, "stock_adjustment", p.session.user.id);
    if (again) return again;
    const picked = await pickProduct(tx, input);
    if (!picked.ok) return picked;
    const loc = await locate(tx, picked.productId, place);
    if (!loc.ok) return loc;
    const m = adjustmentMovement(
      await currentMovements(tx, loc.key),
      loc.key,
      input.bags,
      input.reason,
      String(input.note ?? ""),
      p.session.user.role,
    );
    if (!m.ok) return m;
    const [row] = await tx
      .insert(stockMovements)
      .values(toRow(m.movement, p.session.user.id))
      .returning({ id: stockMovements.id });
    await writeAudit(tx, {
      actorId: p.session.user.id,
      entity: "stock",
      entityId: row.id,
      action: "adjustment",
      details: { ...movementFacts(m.movement), reason: m.movement.reason ?? "" },
    });
    return { ok: true };
  });
  return res.ok ? done() : res;
}

export type TransferInput = {
  productId: string;
  /** Place keys, as in StockInput. `to` may be `NEW_TRUCK_PLACE` (a hired truck typed in `truck`). */
  from: string;
  to: string;
  /** The quick truck form, used when `to` is `NEW_TRUCK_PLACE`. */
  truck?: { number: string; driverName: string; driverPhone: string };
  bags: number;
  note: string;
  /** The form's one-time id: a second tap moves nothing more (request-rules.ts). */
  requestId: string;
};

/**
 * Moves bags between two places (leftovers to the godown, loading a truck). Logistics or admin.
 * The bags may go onto a hired truck typed in the form (found or made by its number, like a purchase).
 */
export async function transferStock(input: TransferInput): Promise<StockResult> {
  const session = await requireRole(...rolesFor("transferStock"));
  const request = checkRequestId(input.requestId);
  if (!request.ok) return request;
  const places = checkTransferPlaces(input.from, input.to);
  if (!places.ok) return places;
  if (!isUuid(input.productId)) return { ok: false, error: "Pick a product." };
  let note = String(input.note ?? "").trim().slice(0, 200);
  let truck: Truck | null = null;
  if (places.to === NEW_TRUCK_PLACE) {
    const check = checkTruck(input.truck ?? {});
    if (!check.ok) return check;
    truck = check.value;
    note = truckNote(note, truck);
  }
  const res = await inTransaction(async (tx) => {
    const again = await firstTime(tx, request.id, "stock_transfer", session.user.id);
    if (again) return again;
    const from = places.from;
    const to: PlaceRef =
      places.to === NEW_TRUCK_PLACE
        ? { kind: "vehicle", id: await truckByNumber(tx, truck?.number ?? "", session.user.id) }
        : places.to;
    // The typed truck may be the very place the bags are on.
    if (placeKey(from) === placeKey(to)) return { ok: false, error: "Pick two different places." };
    // Lock both places in a fixed order (sorted keys) so two moves cannot wait on each other.
    for (const place of [from, to].sort((a, b) => placeKey(a).localeCompare(placeKey(b)))) {
      const locked = await lockPlace(tx, place);
      if (!locked.ok) return { ok: false, error: "Pick two active places." };
    }
    const [product] = await tx.select().from(products).where(eq(products.id, input.productId)).for("share");
    if (!product || !product.active) return { ok: false, error: "Pick an active product." };
    const fromKey: StockKey = { productId: input.productId, placeKey: placeKey(from) };
    const plan = transferMovements(await currentMovements(tx, fromKey), fromKey, placeKey(to), input.bags, note);
    if (!plan.ok) return plan;
    const [out] = await tx
      .insert(stockMovements)
      .values(plan.movements.map((m) => toRow(m, session.user.id)))
      .returning({ id: stockMovements.id });
    await writeAudit(tx, {
      actorId: session.user.id,
      entity: "stock",
      entityId: out.id,
      action: "transfer",
      details: {
        productId: input.productId,
        bags: input.bags,
        from: fromKey.placeKey,
        to: placeKey(to),
        ...(truck ? { truck: truck.number } : {}),
        ...(note ? { reason: note } : {}),
      },
    });
    return { ok: true };
  });
  return res.ok ? done() : res;
}
