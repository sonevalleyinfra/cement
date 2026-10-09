import { asc } from "drizzle-orm";
import { db } from "@/db";
import { retailers, user as users } from "@/db/schema";
import { hasAnyRole, hasRole, isAdmin } from "@/lib/roles";
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
      userId: retailers.userId,
    })
    .from(retailers)
    .orderBy(asc(retailers.name));
  const logins = isAdmin(user.role)
    ? (await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).orderBy(asc(users.name)))
        .filter((u) => hasRole(u.role, "retailer"))
        .map((u) => ({ id: u.id, label: `${u.name} (${u.email})` }))
    : null;
  return <RetailersView rows={rows} canEdit={hasAnyRole(user.role, ["sales"])} logins={logins} />;
}
