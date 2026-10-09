import { asc } from "drizzle-orm";
import { db } from "@/db";
import { retailers } from "@/db/schema";
import { hasAnyRole } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { RetailersView } from "./retailers-view";

export default async function RetailersPage() {
  const { user } = await requireUser();
  const rows = await db
    .select({
      id: retailers.id,
      name: retailers.name,
      phone: retailers.phone,
      place: retailers.place,
      active: retailers.active,
    })
    .from(retailers)
    .orderBy(asc(retailers.name));
  return <RetailersView rows={rows} canEdit={hasAnyRole(user.role, ["sales"])} />;
}
