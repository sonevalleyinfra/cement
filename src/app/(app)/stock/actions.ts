"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getFirmSelection } from "@/components/app/firm-switcher";
import { db } from "@/db";
import { products, stockLocations, stockMovements, vehicles } from "@/db/schema";
import {
  adjustmentMovement,
  canSetOpening,
  checkTransferPlaces,
  cleanLocationName,
  inMovement,
  transferMovements,
  type Movement,
} from "@/lib/stock-rules";
import { writeAudit } from "@/lib/audit";
import { isUuid } from "@/lib/ids";
import { rolesFor } from "@/lib/permissions";
import { requireFirm, requireRole, writeBlock } from "@/lib/session";

export type StockResult = { ok: true } | { ok: false; error: string };

export type StockInput = {
  firmId: string;
  productId: string;
  locationId: string;
  bags: number;
  /** Supplier / note for a purchase, or the reason for an adjustment. */
  note: string;
};

/** Admin only, one firm picked (not "All firms"), and the place must belong to that firm. */
async function prepare(input: StockInput) {
  const session = await requireRole(...rolesFor("manageStock"));
  if (!isUuid(input.firmId) || !isUuid(input.productId) || !isUuid(input.locationId)) {
    return { error: "Pick a product and a place.", session: null } as const;
  }
  await requireFirm(input.firmId);
  const { selection } = await getFirmSelection();
  if (selection.mode !== "firm" || selection.firmId !== input.firmId) {
    return { error: "Pick one firm first.", session: null } as const;
  }
  return { error: null, session } as const;
}

async function checkPlace(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], input: StockInput) {
  const [loc] = await tx
    .select()
    .from(stockLocations)
    .where(eq(stockLocations.id, input.locationId))
    .for("update");
  if (!loc || loc.firmId !== input.firmId || !loc.active) return "Pick an active stock place of this firm.";
  const [product] = await tx.select().from(products).where(eq(products.id, input.productId)).limit(1);
  if (!product || !product.active) return "Pick an active product.";
  return null;
}

async function currentMovements(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: StockInput,
): Promise<Movement[]> {
  // Only the rows for this exact firm + product + place, as plain movements for the rules.
  const rows = await tx
    .select({ type: stockMovements.type, bags: stockMovements.bags })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.firmId, input.firmId),
        eq(stockMovements.productId, input.productId),
        eq(stockMovements.locationId, input.locationId),
      ),
    );
  return rows.map((r) => ({
    firmId: input.firmId,
    productId: input.productId,
    locationId: input.locationId,
    type: r.type as Movement["type"],
    bags: r.bags,
  }));
}

function done(): StockResult {
  revalidatePath("/stock");
  revalidatePath("/dispatch");
  return { ok: true };
}

export async function recordPurchase(input: StockInput): Promise<StockResult> {
  const p = await prepare(input);
  if (p.error !== null) return { ok: false, error: p.error };
  const key = { firmId: input.firmId, productId: input.productId, locationId: input.locationId };
  const m = inMovement("purchase", key, input.bags, String(input.note ?? "").trim().slice(0, 200));
  if (!m.ok) return m;
  const res = await db.transaction(async (tx): Promise<StockResult> => {
    const bad = await checkPlace(tx, input);
    if (bad) return { ok: false, error: bad };
    await tx.insert(stockMovements).values({ ...m.movement, reason: m.movement.reason ?? "", actorId: p.session!.user.id });
    return { ok: true };
  });
  return res.ok ? done() : res;
}

export async function recordOpening(input: StockInput): Promise<StockResult> {
  const p = await prepare(input);
  if (p.error !== null) return { ok: false, error: p.error };
  const key = { firmId: input.firmId, productId: input.productId, locationId: input.locationId };
  const m = inMovement("opening", key, input.bags, "Opening stock");
  if (!m.ok) return m;
  const res = await db.transaction(async (tx): Promise<StockResult> => {
    const bad = await checkPlace(tx, input);
    if (bad) return { ok: false, error: bad };
    const once = canSetOpening(await currentMovements(tx, input), key);
    if (!once.ok) return once;
    await tx.insert(stockMovements).values({ ...m.movement, reason: m.movement.reason ?? "", actorId: p.session!.user.id });
    return { ok: true };
  });
  return res.ok ? done() : res;
}

/** `bags` is signed here: negative removes bags. */
export async function recordAdjustment(input: StockInput): Promise<StockResult> {
  const p = await prepare(input);
  if (p.error !== null) return { ok: false, error: p.error };
  const key = { firmId: input.firmId, productId: input.productId, locationId: input.locationId };
  const res = await db.transaction(async (tx): Promise<StockResult> => {
    const bad = await checkPlace(tx, input);
    if (bad) return { ok: false, error: bad };
    const m = adjustmentMovement(
      await currentMovements(tx, input),
      key,
      input.bags,
      String(input.note ?? ""),
      p.session!.user.role,
    );
    if (!m.ok) return m;
    await tx.insert(stockMovements).values({ ...m.movement, reason: m.movement.reason ?? "", actorId: p.session!.user.id });
    return { ok: true };
  });
  return res.ok ? done() : res;
}

export type TransferInput = {
  firmId: string;
  productId: string;
  fromLocationId: string;
  toLocationId: string;
  bags: number;
  note: string;
};

/** Moves bags between two places of ONE firm (leftovers to the godown, loading a truck). */
export async function transferStock(input: TransferInput): Promise<StockResult> {
  const session = await requireRole(...rolesFor("transferStock"));
  if (!isUuid(input.firmId) || !isUuid(input.productId) || !isUuid(input.fromLocationId) || !isUuid(input.toLocationId)) {
    return { ok: false, error: "Pick a product and two places." };
  }
  if (input.fromLocationId === input.toLocationId) return { ok: false, error: "Pick two different places." };
  await requireFirm(input.firmId);
  const blocked = await writeBlock();
  if (blocked) return { ok: false, error: blocked };
  const { selection } = await getFirmSelection();
  if (selection.mode !== "firm" || selection.firmId !== input.firmId) {
    return { ok: false, error: "Pick one firm first." };
  }
  const note = String(input.note ?? "").trim().slice(0, 200);
  const res = await db.transaction(async (tx): Promise<StockResult> => {
    // Lock both places in a fixed order (sorted ids) so two moves cannot wait on each other.
    const places = new Map<string, { firmId: string; active: boolean }>();
    for (const id of [input.fromLocationId, input.toLocationId].sort()) {
      const [loc] = await tx.select().from(stockLocations).where(eq(stockLocations.id, id)).for("update");
      if (loc) places.set(id, { firmId: loc.firmId, active: loc.active });
    }
    const placesOk = checkTransferPlaces(
      input.firmId,
      places.get(input.fromLocationId),
      places.get(input.toLocationId),
    );
    if (!placesOk.ok) return placesOk;
    const [product] = await tx.select().from(products).where(eq(products.id, input.productId)).limit(1);
    if (!product || !product.active) return { ok: false, error: "Pick an active product." };
    const from = { firmId: input.firmId, productId: input.productId, locationId: input.fromLocationId };
    const plan = transferMovements(
      await currentMovements(tx, { ...from, bags: 0, note: "" }),
      from,
      input.toLocationId,
      input.bags,
      note,
    );
    if (!plan.ok) return plan;
    await tx
      .insert(stockMovements)
      .values(plan.movements.map((m) => ({ ...m, reason: m.reason ?? "", actorId: session.user.id })));
    return { ok: true };
  });
  return res.ok ? done() : res;
}

/** Adds a godown (name) or a vehicle place (vehicleId) for a firm. */
export async function addLocation(
  firmId: string,
  form: { kind: "godown" | "vehicle"; name: string; vehicleId: string | null },
): Promise<StockResult> {
  const session = await requireRole(...rolesFor("manageStock"));
  if (!isUuid(firmId)) return { ok: false, error: "Pick a firm." };
  await requireFirm(firmId);
  const blocked = await writeBlock();
  if (blocked) return { ok: false, error: blocked };
  const actorId = session.user.id;
  if (form.kind === "godown") {
    const name = cleanLocationName(String(form.name ?? ""));
    if (!name) return { ok: false, error: "Enter a name for the godown." };
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(stockLocations)
        .values({ firmId, kind: "godown", name })
        .returning({ id: stockLocations.id });
      await writeAudit(tx, {
        actorId,
        entity: "stock_location",
        entityId: row.id,
        action: "create",
        details: { firmId, kind: "godown", name },
      });
    });
  } else {
    if (!isUuid(form.vehicleId)) return { ok: false, error: "Pick a vehicle." };
    const [v] = await db.select().from(vehicles).where(eq(vehicles.id, form.vehicleId)).limit(1);
    if (!v) return { ok: false, error: "Pick a vehicle." };
    const [dup] = await db
      .select({ id: stockLocations.id })
      .from(stockLocations)
      .where(and(eq(stockLocations.firmId, firmId), eq(stockLocations.vehicleId, v.id)))
      .limit(1);
    if (dup) return { ok: false, error: "This vehicle is already a place for this firm." };
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(stockLocations)
        .values({ firmId, kind: "vehicle", name: v.number, vehicleId: v.id })
        .returning({ id: stockLocations.id });
      await writeAudit(tx, {
        actorId,
        entity: "stock_location",
        entityId: row.id,
        action: "create",
        details: { firmId, kind: "vehicle", name: v.number, vehicleId: v.id },
      });
    });
  }
  revalidatePath("/stock/locations");
  return done();
}

/** Switch a place on or off. Not allowed while it still holds bags. */
export async function setLocationActive(id: string, active: boolean): Promise<StockResult> {
  const session = await requireRole(...rolesFor("manageStock"));
  if (!isUuid(id)) return { ok: false, error: "Place not found." };
  const [loc] = await db.select().from(stockLocations).where(eq(stockLocations.id, id)).limit(1);
  if (!loc) return { ok: false, error: "Place not found." };
  await requireFirm(loc.firmId);
  const blocked = await writeBlock();
  if (blocked) return { ok: false, error: blocked };
  const res = await db.transaction(async (tx): Promise<StockResult> => {
    // Same lock as dispatch and purchase, so bags cannot arrive while we switch it off.
    await tx.select({ id: stockLocations.id }).from(stockLocations).where(eq(stockLocations.id, id)).for("update");
    if (!active) {
      const [left] = await tx
        .select({ bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number) })
        .from(stockMovements)
        .where(eq(stockMovements.locationId, id));
      if ((left?.bags ?? 0) > 0) {
        return { ok: false, error: "Move or adjust the bags out before switching this place off." };
      }
    }
    await tx.update(stockLocations).set({ active }).where(eq(stockLocations.id, id));
    await writeAudit(tx, {
      actorId: session.user.id,
      entity: "stock_location",
      entityId: id,
      action: active ? "activate" : "deactivate",
      details: { firmId: loc.firmId, name: loc.name },
    });
    return { ok: true };
  });
  if (!res.ok) return res;
  revalidatePath("/stock/locations");
  return done();
}
