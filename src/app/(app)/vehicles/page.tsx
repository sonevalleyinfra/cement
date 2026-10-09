import { asc } from "drizzle-orm";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { hasAnyRole } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { VehiclesView } from "./vehicles-view";

export default async function VehiclesPage() {
  const { user } = await requireUser();
  const rows = await db
    .select({
      id: vehicles.id,
      number: vehicles.number,
      driverName: vehicles.driverName,
      driverPhone: vehicles.driverPhone,
      active: vehicles.active,
    })
    .from(vehicles)
    .orderBy(asc(vehicles.number));
  return <VehiclesView rows={rows} canEdit={hasAnyRole(user.role, ["logistics"])} />;
}
