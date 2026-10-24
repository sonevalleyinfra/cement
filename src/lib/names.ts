import { db } from "@/db";
import { areas, brands, cementTypes, godowns, grades, products, retailers, user, vehicles } from "@/db/schema";

/** Today's names of people, shops, products and places, by id. Small tables, read whole. Server-only. */

export type Names = Map<string, string>;
export const toMap = (rows: { id: string; name: string }[]): Names => new Map(rows.map((r) => [r.id, r.name]));

/** Names of people, shops, products, godowns and trucks (by number). */
export async function nameMaps() {
  const [people, shops, items, gs, vs] = await Promise.all([
    db.select({ id: user.id, name: user.name }).from(user),
    db.select({ id: retailers.id, name: retailers.name }).from(retailers),
    db.select({ id: products.id, name: products.name }).from(products),
    db.select({ id: godowns.id, name: godowns.name }).from(godowns),
    db.select({ id: vehicles.id, name: vehicles.number }).from(vehicles),
  ]);
  return { people: toMap(people), retailers: toMap(shops), products: toMap(items), godowns: toMap(gs), vehicles: toMap(vs) };
}

/** Every name in one map (ids never clash: uuids and auth ids), plus brands, cement types, grades and areas, for the activity log. */
export async function allNames(): Promise<Names> {
  const [n, brandRows, types, gradeRows, areaRows] = await Promise.all([
    nameMaps(),
    db.select({ id: brands.id, name: brands.name }).from(brands),
    db.select({ id: cementTypes.id, name: cementTypes.code }).from(cementTypes),
    db.select({ id: grades.id, name: grades.name }).from(grades),
    db.select({ id: areas.id, name: areas.name }).from(areas),
  ]);
  return new Map([
    ...n.people,
    ...n.retailers,
    ...n.products,
    ...n.godowns,
    ...n.vehicles,
    ...toMap(brandRows),
    ...toMap(types),
    ...toMap(gradeRows),
    ...toMap(areaRows),
  ]);
}
