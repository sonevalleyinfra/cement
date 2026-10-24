import { asc, count, desc, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { areas, retailers } from "@/db/schema";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { AreasView } from "./areas-view";

export default async function AreasPage() {
  await requireRole(...rolesFor("editRetailers"));
  const [rows, uses] = await Promise.all([
    db
      .select({ id: areas.id, name: areas.name, active: areas.active })
      .from(areas)
      .orderBy(desc(areas.active), asc(areas.sortOrder), asc(areas.name)),
    // Shops in each area.
    db
      .select({ areaId: retailers.areaId, shops: count() })
      .from(retailers)
      .where(isNotNull(retailers.areaId))
      .groupBy(retailers.areaId),
  ]);
  const shopsIn = (id: string) => uses.find((u) => u.areaId === id)?.shops ?? 0;
  return <AreasView rows={rows.map((r) => ({ ...r, shops: shopsIn(r.id) }))} />;
}
