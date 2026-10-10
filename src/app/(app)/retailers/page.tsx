import { asc } from "drizzle-orm";
import { db } from "@/db";
import { retailers, user as users } from "@/db/schema";
import { can, rolesFor } from "@/lib/permissions";
import { pickableRetailerLogins } from "@/lib/retailer-rules";
import { pickableSalesReps } from "@/lib/sales-rep-rules";
import { hasRole, isAdmin } from "@/lib/roles";
import { requireRole } from "@/lib/session";
import { RetailersView } from "./retailers-view";

export default async function RetailersPage() {
  // Retailer phones are internal: staff only (a retailer would see every other shop).
  const { user } = await requireRole(...rolesFor("viewRetailers"));
  const rows = await db
    .select({
      id: retailers.id,
      name: retailers.name,
      phone: retailers.phone,
      place: retailers.place,
      active: retailers.active,
      userId: retailers.userId,
      salesRepId: retailers.salesRepId,
    })
    .from(retailers)
    .orderBy(asc(retailers.name));
  const canEdit = can(user.role, "editRetailers");
  const allLogins =
    isAdmin(user.role) || canEdit || can(user.role, "assignSalesRep")
      ? await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            phone: users.phone,
            role: users.role,
            banned: users.banned,
            deletedAt: users.deletedAt,
          })
          .from(users)
          .orderBy(asc(users.name))
      : [];
  const logins = isAdmin(user.role)
    ? allLogins
        .filter((u) => hasRole(u.role, "retailer"))
        .map((u) => ({ id: u.id, label: `${u.name} (${u.email})` }))
    : null;
  // Sales add retailers only by picking from the retailer logins the admin created.
  const pickable = canEdit
    ? pickableRetailerLogins(
        allLogins,
        rows.map((r) => r.userId),
      ).map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone }))
    : [];
  // Everyone who sees the list sees each shop's sales person; only admin may change it.
  const people: { id: string; name: string }[] =
    allLogins.length > 0 ? allLogins : await db.select({ id: users.id, name: users.name }).from(users);
  const names = new Map(people.map((u) => [u.id, u.name]));
  const shown = rows.map((r) => ({ ...r, salesRepName: r.salesRepId ? (names.get(r.salesRepId) ?? "") : "" }));
  const salesReps = can(user.role, "assignSalesRep")
    ? pickableSalesReps(allLogins).map((u) => ({ id: u.id, label: u.name }))
    : null;
  return <RetailersView rows={shown} canEdit={canEdit} logins={logins} pickable={pickable} salesReps={salesReps} />;
}
