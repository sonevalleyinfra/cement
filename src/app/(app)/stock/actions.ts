"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { grades, products, purchases, stockMovements, vehicles } from "@/db/schema";
import { toISTDateKey } from "@/lib/datetime";
import { formatINR } from "@/lib/money";
import { postSupplierEntry } from "@/lib/suppliers";
import { checkCostPerBag, purchaseEntry } from "@/lib/supplier-rules";
import { writeAudit } from "@/lib/audit";
import { DEFAULT_BAG_KG, isProductChannel, resolveProduct } from "@/lib/catalogue-rules";
import { saveOnce } from "@/lib/form-submissions";
import { checkRequestId } from "@/lib/request-rules";
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
import { checkClaimChange, checkPurchaseDetails, claimValuePaise } from "@/lib/purchase-rules";
import { checkDriver, checkTruck, truckNote, type Truck } from "@/lib/vehicle-rules";

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
  /**
   * Purchase only (required): the truck and driver. A new truck or a godown uses the typed number;
   * an existing truck place keeps its own number (the typed one is ignored).
   */
  truck?: { number: string; driverName: string; driverPhone: string };
  /** Signed for an adjustment; the BILLED bags for a purchase. */
  bags: number;
  /** Supplier / note for a purchase, or the optional note with an adjustment. */
  note: string;
  /** Adjustment only: the reason code (stock list in reason-codes.ts). */
  reason?: string;
  /** Purchase only (required): what one bag cost, in paise. */
  costPerBagPaise?: number;
  /** Purchase only (required): the supplier's invoice number and date ("YYYY-MM-DD"). */
  invoiceNo?: string;
  invoiceDate?: string;
  /** Purchase only: billed bags that never arrived / arrived burst (empty = 0). */
  shortBags?: number;
  burstBags?: number;
  /** Purchase only: freight and unloading we paid, in paise (empty = 0). */
  freightPaise?: number;
  unloadingPaise?: number;
  /** The form's one-time id: a second tap saves nothing more (request-rules.ts). */
  requestId: string;
};

/** Admin only. Only a purchase may use a typed-in truck. */
async function prepare(
  input: StockInput,
  action: "manageStock" | "recordPurchase" = "manageStock",
  allowNewTruck = false,
) {
  const session = await requireRole(...rolesFor(action));
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
    reasonCode: m.reasonCode ?? null,
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
 * A purchase adds the BILLED bags AND what we now owe the supplier of the product's brand (billed x cost per bag,
 * dated on the invoice date), in one transaction: either all is saved or nothing. Short and burst bags are taken
 * out again by linked adjustments (transit_short / transit_burst), so the stock is what was received. The header
 * row (`purchases`) keeps the invoice, truck, driver, bags, freight + unloading and the landed cost per good bag.
 */
export async function recordPurchase(input: StockInput): Promise<StockResult> {
  const p = await prepare(input, "recordPurchase", true);
  if (p.error !== null) return { ok: false, error: p.error };
  const cost = checkCostPerBag(input.costPerBagPaise);
  if (!cost.ok) return cost;
  const chosen = p.place;
  // The truck: an existing truck place keeps its own number (read below), else the typed one is needed.
  const typed = input.truck ?? {};
  let truck: Truck;
  if (chosen !== NEW_TRUCK_PLACE && chosen.kind === "vehicle") {
    const driver = checkDriver(typed);
    if (!driver.ok) return driver;
    truck = { number: "", ...driver.value };
  } else {
    const check = checkTruck(typed);
    if (!check.ok) return check;
    truck = check.value;
  }
  const details = checkPurchaseDetails(
    {
      invoiceNo: input.invoiceNo,
      invoiceDate: input.invoiceDate,
      billedBags: input.bags,
      shortBags: input.shortBags,
      burstBags: input.burstBags,
      freightPaise: input.freightPaise,
      unloadingPaise: input.unloadingPaise,
      costPerBagPaise: cost.costPaise,
    },
    toISTDateKey(new Date()),
  );
  if (!details.ok) return details;
  const d = details.value;
  const note = String(input.note ?? "").trim().slice(0, 200);
  const actorId = p.session.user.id;
  const res = await saveOnce({ id: p.requestId, kind: "purchase", actorId }, async (tx) => {
    const picked = await pickProduct(tx, input);
    if (!picked.ok) return picked;
    // A typed-in truck is found (or made) by its number, so the same truck always has the same stock.
    const place: PlaceRef = chosen === NEW_TRUCK_PLACE ? { kind: "vehicle", id: await truckByNumber(tx, truck.number, actorId) } : chosen;
    const loc = await locate(tx, picked.productId, place);
    if (!loc.ok) return loc;
    if (chosen !== NEW_TRUCK_PLACE && chosen.kind === "vehicle") {
      const [v] = await tx.select({ number: vehicles.number }).from(vehicles).where(eq(vehicles.id, chosen.id));
      if (!v) return { ok: false, error: "Pick an active place." };
      truck = { ...truck, number: v.number };
    }
    const m = inMovement("purchase", loc.key, d.billedBags, note);
    if (!m.ok) return m;
    const [product] = await tx
      .select({ name: products.name, brandId: products.brandId })
      .from(products)
      .where(eq(products.id, picked.productId));
    if (!product) return { ok: false, error: "Pick an active product." };
    // The amount is owed to the supplier of this product's brand, on the invoice date.
    const owed = purchaseEntry(product, d.billedBags, cost.costPaise, d.invoiceDate, {
      reference: d.invoiceNo,
      description: `${d.billedBags} bags ${product.name} at ${formatINR(cost.costPaise)}`.replace(/\s+/g, " "),
    });
    if (!owed.ok) return owed;
    const [moved] = await tx
      .insert(stockMovements)
      .values({ ...toRow(m.movement, actorId), unitCostPaise: cost.costPaise })
      .returning({ id: stockMovements.id });
    // Short and burst bags leave again right after (a moment later, so the running stock never dips below 0).
    const linked: { movement: Movement; id: string }[] = [];
    const losses = [
      { bags: d.shortBags, code: "transit_short", reason: `Short on invoice ${d.invoiceNo}` },
      { bags: d.burstBags, code: "transit_burst", reason: `Burst on invoice ${d.invoiceNo}` },
    ] as const;
    for (const [i, loss] of losses.entries()) {
      if (loss.bags === 0) continue;
      const movement: Movement = { ...loc.key, type: "adjustment", bags: -loss.bags, reason: loss.reason, reasonCode: loss.code };
      const [row] = await tx
        .insert(stockMovements)
        .values({ ...toRow(movement, actorId), createdAt: sql`now() + make_interval(secs => ${(i + 1) / 1000})` })
        .returning({ id: stockMovements.id });
      linked.push({ movement, id: row.id });
    }
    const shortId = linked.find((l) => l.movement.reasonCode === "transit_short")?.id ?? null;
    const burstId = linked.find((l) => l.movement.reasonCode === "transit_burst")?.id ?? null;
    await postSupplierEntry(tx, owed.entry, actorId, moved.id, { audit: false });
    const [header] = await tx
      .insert(purchases)
      .values({
        stockMovementId: moved.id,
        invoiceNo: d.invoiceNo,
        invoiceDate: d.invoiceDate,
        truckNumber: truck.number,
        driverName: truck.driverName,
        driverPhone: truck.driverPhone,
        billedBags: d.billedBags,
        shortBags: d.shortBags,
        burstBags: d.burstBags,
        receivedBags: d.receivedBags,
        freightPaise: d.freightPaise,
        unloadingPaise: d.unloadingPaise,
        landedUnitCostPaise: d.landedUnitCostPaise,
        shortMovementId: shortId,
        burstMovementId: burstId,
        claimStatus: d.claimStatus,
        actorId,
      })
      .returning({ id: purchases.id });
    await writeAudit(tx, {
      actorId,
      entity: "stock",
      entityId: moved.id,
      action: "purchase",
      details: {
        ...movementFacts(m.movement),
        unitCostPaise: cost.costPaise,
        amountPaise: owed.entry.amountPaise,
        brandId: owed.entry.brandId,
        invoiceNo: d.invoiceNo,
        invoiceDate: d.invoiceDate,
        truck: truck.number,
        driverName: truck.driverName,
        billedBags: d.billedBags,
        shortBags: d.shortBags,
        burstBags: d.burstBags,
        receivedBags: d.receivedBags,
        freightPaise: d.freightPaise,
        unloadingPaise: d.unloadingPaise,
        landedUnitCostPaise: d.landedUnitCostPaise,
        purchaseId: header.id,
      },
    });
    // Every adjustment movement has its own log row (Books check I12).
    for (const l of linked) {
      await writeAudit(tx, {
        actorId,
        entity: "stock",
        entityId: l.id,
        action: "adjustment",
        details: { ...movementFacts(l.movement), reasonCode: l.movement.reasonCode, reason: l.movement.reason ?? "", purchaseId: header.id },
      });
    }
    return { ok: true, resultId: moved.id };
  });
  if (!res.ok) return res;
  revalidatePath("/suppliers", "layout");
  revalidatePath("/stock/purchases");
  return done();
}

/**
 * Moves the claim on a purchase's short / burst bags forward (open → claimed → credited). Admin only.
 * It posts no supplier credit: the money is recorded with a supplier Credit entry.
 */
export async function setPurchaseClaim(input: { purchaseId: string; status: string; requestId: string }): Promise<StockResult> {
  const session = await requireRole(...rolesFor("recordPurchase"));
  const request = checkRequestId(input.requestId);
  if (!request.ok) return request;
  if (!isUuid(input.purchaseId)) return { ok: false, error: "That purchase was not found." };
  const res = await saveOnce({ id: request.id, kind: "purchase_claim", actorId: session.user.id }, async (tx) => {
    const [row] = await tx
      .select({
        id: purchases.id,
        claimStatus: purchases.claimStatus,
        invoiceNo: purchases.invoiceNo,
        shortBags: purchases.shortBags,
        burstBags: purchases.burstBags,
        unitCostPaise: stockMovements.unitCostPaise,
      })
      .from(purchases)
      .innerJoin(stockMovements, eq(stockMovements.id, purchases.stockMovementId))
      .where(eq(purchases.id, input.purchaseId))
      .for("update", { of: purchases });
    if (!row) return { ok: false, error: "That purchase was not found." };
    const change = checkClaimChange(row.claimStatus, input.status);
    if (!change.ok) return change;
    await tx
      .update(purchases)
      .set({ claimStatus: change.status, claimUpdatedAt: new Date(), claimUpdatedBy: session.user.id })
      .where(eq(purchases.id, row.id));
    const bags = row.shortBags + row.burstBags;
    await writeAudit(tx, {
      actorId: session.user.id,
      entity: "stock",
      entityId: row.id,
      action: "claim",
      details: {
        from: row.claimStatus,
        to: change.status,
        purchaseId: row.id,
        invoiceNo: row.invoiceNo,
        bags,
        claimValuePaise: claimValuePaise(bags, row.unitCostPaise ?? 0),
      },
    });
    return { ok: true, resultId: row.id };
  });
  if (!res.ok) return res;
  revalidatePath("/stock/purchases");
  return { ok: true };
}

export async function recordOpening(input: StockInput): Promise<StockResult> {
  const p = await prepare(input);
  if (p.error !== null) return { ok: false, error: p.error };
  const place = p.place;
  const requestId = p.requestId;
  if (place === NEW_TRUCK_PLACE) return { ok: false, error: "Pick a product and a place." };
  const res = await saveOnce({ id: requestId, kind: "opening_stock", actorId: p.session.user.id }, async (tx) => {
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
    return { ok: true, resultId: row.id };
  });
  return res.ok ? done() : res;
}

/** A stock correction. `bags` is signed here: negative removes bags. `reason` = a stock reason code, `note` optional ("other" needs one). */
export async function recordAdjustment(input: StockInput): Promise<StockResult> {
  const p = await prepare(input);
  if (p.error !== null) return { ok: false, error: p.error };
  const place = p.place;
  const requestId = p.requestId;
  if (place === NEW_TRUCK_PLACE) return { ok: false, error: "Pick a product and a place." };
  const res = await saveOnce({ id: requestId, kind: "stock_adjustment", actorId: p.session.user.id }, async (tx) => {
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
      details: { ...movementFacts(m.movement), reasonCode: m.movement.reasonCode, reason: m.movement.reason ?? "" },
    });
    return { ok: true, resultId: row.id };
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
    // Out of scope for the A6 rule: the phone stays optional when moving bags onto a hired truck.
    const check = checkTruck(input.truck ?? {}, { phoneRequired: false });
    if (!check.ok) return check;
    truck = check.value;
    note = truckNote(note, truck);
  }
  const res = await saveOnce({ id: request.id, kind: "stock_transfer", actorId: session.user.id }, async (tx) => {
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
    return { ok: true, resultId: out.id };
  });
  return res.ok ? done() : res;
}
