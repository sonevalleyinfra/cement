import { asc, eq } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { getFirmSelection } from "@/components/app/firm-switcher";
import { db } from "@/db";
import { stockLocations, vehicles } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { LocationsView } from "./locations-view";

export default async function LocationsPage() {
  await requireRole("admin");
  const { selection } = await getFirmSelection();
  if (selection.mode !== "firm") return <EmptyState title="Pick one firm first" />;
  const [places, vs] = await Promise.all([
    db.select().from(stockLocations).where(eq(stockLocations.firmId, selection.firmId)).orderBy(asc(stockLocations.name)),
    db.select().from(vehicles).where(eq(vehicles.active, true)).orderBy(asc(vehicles.number)),
  ]);
  const used = new Set(places.map((p) => p.vehicleId));
  return (
    <LocationsView
      firmId={selection.firmId}
      places={places.map((p) => ({ id: p.id, name: p.name, kind: p.kind, active: p.active }))}
      freeVehicles={vs.filter((v) => !used.has(v.id)).map((v) => ({ id: v.id, number: v.number }))}
    />
  );
}
