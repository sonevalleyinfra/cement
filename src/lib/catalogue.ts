import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { brands, cementTypes, grades, products } from "@/db/schema";

/**
 * Products with their parts, in catalogue order: Trade first, then by type and grade. Server-only.
 * `activeOnly` for drop-downs (switched-off products are hidden there).
 */
export async function getProducts({ activeOnly }: { activeOnly: boolean }) {
  return db
    .select({
      id: products.id,
      name: products.name,
      channel: products.channel,
      brandId: products.brandId,
      gradeId: products.gradeId,
      typeId: grades.typeId,
      brand: brands.name,
      typeCode: cementTypes.code,
      grade: grades.name,
      bagKg: products.bagKg,
      active: products.active,
    })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(grades, eq(grades.id, products.gradeId))
    .innerJoin(cementTypes, eq(cementTypes.id, grades.typeId))
    .where(activeOnly ? eq(products.active, true) : undefined)
    .orderBy(
      // "trade" sorts after "non_trade", so descending puts Trade first.
      desc(products.channel),
      asc(brands.name),
      asc(cementTypes.sortOrder),
      asc(cementTypes.code),
      asc(grades.sortOrder),
      asc(grades.name),
      asc(products.bagKg),
    );
}

/** Every brand, type and grade (switched-off ones too), in drop-down order. Server-only. */
export async function getCatalogueLists() {
  const [brandRows, typeRows, gradeRows] = await Promise.all([
    db.select({ id: brands.id, name: brands.name, active: brands.active }).from(brands).orderBy(asc(brands.name)),
    db
      .select({ id: cementTypes.id, code: cementTypes.code, name: cementTypes.name, active: cementTypes.active })
      .from(cementTypes)
      .orderBy(asc(cementTypes.sortOrder), asc(cementTypes.code)),
    db
      .select({ id: grades.id, typeId: grades.typeId, name: grades.name, active: grades.active })
      .from(grades)
      .orderBy(asc(grades.sortOrder), asc(grades.name)),
  ]);
  return { brands: brandRows, types: typeRows, grades: gradeRows };
}
