import { asc } from "drizzle-orm";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { can, rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { VehiclesView } from "./vehicles-view";

export default async function VehiclesPage() {
  const { user } = await requireRole(...rolesFor("viewVehicles"));
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
  return <VehiclesView rows={rows} canEdit={can(user.role, "editVehicles")} />;
}
