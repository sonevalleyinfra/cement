"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { brands, cementTypes, grades, products, stockMovements } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import {
  canSwitchOffBrand,
  canSwitchOffProduct,
  canSwitchOnProduct,
  cleanListName,
  cleanTypeCode,
  isDuplicateName,
  renamedProducts,
  validateNewProduct,
  type NewProductInput,
} from "@/lib/catalogue-rules";
import { isUuid } from "@/lib/ids";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import type { Tx } from "@/lib/stock-places";

/** `id` is the new row's id after an add. */
export type CatalogueResult = { ok: true; id?: string } | { ok: false; error: string };

function done(res: CatalogueResult = { ok: true }): CatalogueResult {
  revalidatePath("/catalogue");
  revalidatePath("/stock", "layout");
  revalidatePath("/orders/new");
  revalidatePath("/suppliers", "layout");
  return res;
}

/** Adds a product from the drop-downs (brand first). Its name is built, never typed. Admin only. */
export async function addProduct(input: NewProductInput): Promise<CatalogueResult> {
  const session = await requireRole(...rolesFor("manageCatalogue"));
  if (!isUuid(input.brandId) || !isUuid(input.typeId) || !isUuid(input.gradeId)) {
    return { ok: false, error: "Pick every option." };
  }
  const res = await db.transaction(async (tx): Promise<CatalogueResult> => {
    // Lock the lists so two admins cannot add the same product at once.
    await tx.execute(sql`lock table ${products} in share row exclusive mode`);
    const [b, t, g, p] = await Promise.all([
      tx.select({ id: brands.id, name: brands.name, active: brands.active }).from(brands),
      tx.select({ id: cementTypes.id, code: cementTypes.code, active: cementTypes.active }).from(cementTypes),
      tx.select({ id: grades.id, typeId: grades.typeId, name: grades.name, active: grades.active }).from(grades),
      tx
        .select({ brandId: products.brandId, channel: products.channel, gradeId: products.gradeId, bagKg: products.bagKg })
        .from(products),
    ]);
    const check = validateNewProduct(
      { ...input, bagKg: Number(input.bagKg) },
      { brands: b, types: t, grades: g, products: p },
    );
    if (!check.ok) return check;
    const [row] = await tx.insert(products).values(check.value).returning({ id: products.id });
    await writeAudit(tx, {
      actorId: session.user.id,
      entity: "product",
      entityId: row.id,
      action: "create",
      details: { ...check.value },
    });
    return { ok: true };
  });
  return res.ok ? done(res) : res;
}

/** Switches a product on or off. Off is refused while any of its bags are still in stock; on needs its brand on. */
export async function setProductActive(id: string, active: boolean): Promise<CatalogueResult> {
  const session = await requireRole(...rolesFor("manageCatalogue"));
  if (!isUuid(id)) return { ok: false, error: "Product not found." };
  const res = await db.transaction(async (tx): Promise<CatalogueResult> => {
    const [row] = await tx.select().from(products).where(eq(products.id, id)).for("update");
    if (!row) return { ok: false, error: "Product not found." };
    if (active) {
      const [brand] = await tx.select({ active: brands.active }).from(brands).where(eq(brands.id, row.brandId)).for("share");
      const ok = canSwitchOnProduct(Boolean(brand?.active));
      if (!ok.ok) return ok;
    } else {
      const [left] = await tx
        .select({ bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number) })
        .from(stockMovements)
        .where(eq(stockMovements.productId, id));
      const ok = canSwitchOffProduct(left?.bags ?? 0);
      if (!ok.ok) return ok;
    }
    await tx.update(products).set({ active, updatedAt: new Date() }).where(eq(products.id, id));
    await writeAudit(tx, {
      actorId: session.user.id,
      entity: "product",
      entityId: id,
      action: active ? "activate" : "deactivate",
      details: { name: row.name },
    });
    return { ok: true };
  });
  return res.ok ? done(res) : res;
}

/** Adds a brand, e.g. "UltraTech". It gets its own supplier account (empty until the first entry). */
export async function addBrand(name: string): Promise<CatalogueResult> {
  const session = await requireRole(...rolesFor("manageCatalogue"));
  const clean = cleanListName(name);
  if (!clean) return { ok: false, error: "Enter a brand name." };
  const res = await db.transaction(async (tx): Promise<CatalogueResult> => {
    await tx.execute(sql`lock table ${brands} in share row exclusive mode`);
    const existing = await tx.select({ name: brands.name }).from(brands);
    if (isDuplicateName(clean, existing.map((e) => e.name))) return { ok: false, error: "Brand already added." };
    const [row] = await tx.insert(brands).values({ name: clean }).returning({ id: brands.id });
    await writeAudit(tx, { actorId: session.user.id, entity: "brand", entityId: row.id, action: "create", details: { name: clean } });
    return { ok: true, id: row.id };
  });
  return res.ok ? done(res) : res;
}

/** Adds a cement type, e.g. code "PSC", name "Portland Slag Cement". */
export async function addCementType(form: { code: string; name: string }): Promise<CatalogueResult> {
  const session = await requireRole(...rolesFor("manageCatalogue"));
  const code = cleanTypeCode(form.code);
  if (!code) return { ok: false, error: "Enter a short code, e.g. PSC." };
  const name = cleanListName(form.name, 60) ?? "";
  const res = await db.transaction(async (tx): Promise<CatalogueResult> => {
    await tx.execute(sql`lock table ${cementTypes} in share row exclusive mode`);
    const existing = await tx.select({ code: cementTypes.code, sortOrder: cementTypes.sortOrder }).from(cementTypes);
    if (existing.some((e) => e.code === code)) return { ok: false, error: "Type already added." };
    const sortOrder = Math.max(0, ...existing.map((e) => e.sortOrder)) + 1;
    const [row] = await tx.insert(cementTypes).values({ code, name, sortOrder }).returning({ id: cementTypes.id });
    await writeAudit(tx, { actorId: session.user.id, entity: "cement_type", entityId: row.id, action: "create", details: { code, name } });
    return { ok: true, id: row.id };
  });
  return res.ok ? done(res) : res;
}

/** Adds a grade under one type, e.g. "53" under OPC. */
export async function addGrade(form: { typeId: string; name: string }): Promise<CatalogueResult> {
  const session = await requireRole(...rolesFor("manageCatalogue"));
  if (!isUuid(form.typeId)) return { ok: false, error: "Pick a type." };
  const name = cleanListName(form.name, 20);
  if (!name) return { ok: false, error: "Enter a grade." };
  const res = await db.transaction(async (tx): Promise<CatalogueResult> => {
    await tx.execute(sql`lock table ${grades} in share row exclusive mode`);
    const [type] = await tx.select().from(cementTypes).where(eq(cementTypes.id, form.typeId)).limit(1);
    if (!type || !type.active) return { ok: false, error: "Pick a type." };
    const existing = await tx
      .select({ name: grades.name, sortOrder: grades.sortOrder })
      .from(grades)
      .where(eq(grades.typeId, type.id));
    if (isDuplicateName(name, existing.map((e) => e.name))) return { ok: false, error: "Grade already added." };
    const sortOrder = Math.max(0, ...existing.map((e) => e.sortOrder)) + 1;
    const [row] = await tx.insert(grades).values({ typeId: type.id, name, sortOrder }).returning({ id: grades.id });
    await writeAudit(tx, {
      actorId: session.user.id,
      entity: "grade",
      entityId: row.id,
      action: "create",
      details: { type: type.code, name },
    });
    return { ok: true, id: row.id };
  });
  return res.ok ? done(res) : res;
}

/** The lists admin edits. */
export type CatalogueList = "brand" | "cement_type" | "grade";

/**
 * Switches a brand, type or grade on or off. Off only hides it when adding new products;
 * products already made from a type or grade stay as they are (switch those off in the Products tab).
 * A brand can be switched off only when none of its products are on and none of its bags are in stock.
 */
export async function setListItemActive(list: CatalogueList, id: string, active: boolean): Promise<CatalogueResult> {
  const session = await requireRole(...rolesFor("manageCatalogue"));
  if (!isUuid(id)) return { ok: false, error: "Not found." };
  const res = await db.transaction(async (tx): Promise<CatalogueResult> => {
    let changed: { id: string }[];
    if (list === "brand") {
      if (!active) {
        // Locked so no product of this brand is switched on (or bought) while we check.
        await tx.execute(sql`lock table ${products} in share row exclusive mode`);
        const [on] = await tx
          .select({ n: sql<number>`count(*)`.mapWith(Number) })
          .from(products)
          .where(and(eq(products.brandId, id), eq(products.active, true)));
        const [stock] = await tx
          .select({ bags: sql<number>`coalesce(sum(${stockMovements.bags}), 0)`.mapWith(Number) })
          .from(stockMovements)
          .innerJoin(products, eq(products.id, stockMovements.productId))
          .where(eq(products.brandId, id));
        const ok = canSwitchOffBrand({ activeProducts: on?.n ?? 0, bagsInStock: stock?.bags ?? 0 });
        if (!ok.ok) return ok;
      }
      changed = await tx.update(brands).set({ active, updatedAt: new Date() }).where(eq(brands.id, id)).returning({ id: brands.id });
    } else if (list === "cement_type") {
      changed = await tx.update(cementTypes).set({ active }).where(eq(cementTypes.id, id)).returning({ id: cementTypes.id });
    } else if (list === "grade") {
      changed = await tx.update(grades).set({ active }).where(eq(grades.id, id)).returning({ id: grades.id });
    } else {
      return { ok: false, error: "Not found." };
    }
    if (changed.length === 0) return { ok: false, error: "Not found." };
    await writeAudit(tx, { actorId: session.user.id, entity: list, entityId: id, action: active ? "activate" : "deactivate" });
    return { ok: true };
  });
  return res.ok ? done(res) : res;
}

/** Products made from a brand, type or grade, with their parts, to rebuild their names. */
async function productsWithParts(tx: Tx, list: CatalogueList, id: string) {
  const where =
    list === "brand" ? eq(products.brandId, id) : list === "grade" ? eq(products.gradeId, id) : eq(grades.typeId, id);
  return tx
    .select({
      id: products.id,
      name: products.name,
      brand: brands.name,
      channel: products.channel,
      typeCode: cementTypes.code,
      grade: grades.name,
      bagKg: products.bagKg,
    })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(grades, eq(grades.id, products.gradeId))
    .innerJoin(cementTypes, eq(cementTypes.id, grades.typeId))
    .where(where);
}

/**
 * Renames a brand, type (code and full name) or grade. Product names are built from these,
 * so every product made from it gets its new name in the same transaction.
 */
export async function renameListItem(
  list: CatalogueList,
  id: string,
  form: { name: string; code?: string },
): Promise<CatalogueResult> {
  const session = await requireRole(...rolesFor("manageCatalogue"));
  if (!isUuid(id)) return { ok: false, error: "Not found." };
  const res = await db.transaction(async (tx): Promise<CatalogueResult> => {
    await tx.execute(sql`lock table ${products} in share row exclusive mode`);
    let from: string;
    let to: string;
    if (list === "brand") {
      const name = cleanListName(form.name);
      if (!name) return { ok: false, error: "Enter a brand name." };
      await tx.execute(sql`lock table ${brands} in share row exclusive mode`);
      const [row] = await tx.select().from(brands).where(eq(brands.id, id));
      if (!row) return { ok: false, error: "Not found." };
      const others = await tx.select({ name: brands.name }).from(brands).where(ne(brands.id, id));
      if (isDuplicateName(name, others.map((o) => o.name))) return { ok: false, error: "Brand already added." };
      await tx.update(brands).set({ name, updatedAt: new Date() }).where(eq(brands.id, id));
      [from, to] = [row.name, name];
    } else if (list === "cement_type") {
      const code = cleanTypeCode(form.code ?? "");
      if (!code) return { ok: false, error: "Enter a short code, e.g. PSC." };
      const name = cleanListName(form.name, 60) ?? "";
      await tx.execute(sql`lock table ${cementTypes} in share row exclusive mode`);
      const [row] = await tx.select().from(cementTypes).where(eq(cementTypes.id, id));
      if (!row) return { ok: false, error: "Not found." };
      const [taken] = await tx
        .select({ id: cementTypes.id })
        .from(cementTypes)
        .where(and(eq(cementTypes.code, code), ne(cementTypes.id, id)));
      if (taken) return { ok: false, error: "Type already added." };
      await tx.update(cementTypes).set({ code, name }).where(eq(cementTypes.id, id));
      [from, to] = [`${row.code} ${row.name}`.trim(), `${code} ${name}`.trim()];
    } else if (list === "grade") {
      const name = cleanListName(form.name, 20);
      if (!name) return { ok: false, error: "Enter a grade." };
      await tx.execute(sql`lock table ${grades} in share row exclusive mode`);
      const [row] = await tx.select().from(grades).where(eq(grades.id, id));
      if (!row) return { ok: false, error: "Not found." };
      const others = await tx
        .select({ name: grades.name })
        .from(grades)
        .where(and(eq(grades.typeId, row.typeId), ne(grades.id, id)));
      if (isDuplicateName(name, others.map((o) => o.name))) return { ok: false, error: "Grade already added." };
      await tx.update(grades).set({ name }).where(eq(grades.id, id));
      [from, to] = [row.name, name];
    } else {
      return { ok: false, error: "Not found." };
    }
    for (const p of renamedProducts(await productsWithParts(tx, list, id))) {
      await tx.update(products).set({ name: p.name, updatedAt: new Date() }).where(eq(products.id, p.id));
    }
    await writeAudit(tx, { actorId: session.user.id, entity: list, entityId: id, action: "rename", details: { from, to } });
    return { ok: true };
  });
  if (!res.ok) return res;
  // Product names show on many screens (orders, dispatch, stock, home).
  revalidatePath("/", "layout");
  return done(res);
}
