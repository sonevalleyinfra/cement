import { asc } from "drizzle-orm";
import { db } from "@/db";
import { brands, cementTypes, grades } from "@/db/schema";
import { getProducts } from "@/lib/catalogue";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { CatalogueView } from "./catalogue-view";

export default async function CataloguePage() {
  await requireRole(...rolesFor("manageCatalogue"));
  const [productRows, brandRows, typeRows, gradeRows] = await Promise.all([
    getProducts({ activeOnly: false }),
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
  return <CatalogueView products={productRows} brands={brandRows} types={typeRows} grades={gradeRows} />;
}
