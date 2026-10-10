import { asc } from "drizzle-orm";
import { db } from "@/db";
import { retailers, user as users } from "@/db/schema";
import { can, rolesFor } from "@/lib/permissions";
import { pickableRetailerLogins } from "@/lib/retailer-rules";
import { pickableSalesReps } from "@/lib/sales-rep-rules";
import { requireRole } from "@/lib/session";
import { RetailersView } from "./retailers-view";

export default async function RetailersPage() {
  // Retailer phones are internal: staff only (a retailer would see every other shop).
  const { user } = await requireRole(...rolesFor("viewRetailers"));
  const [rows, people] = await Promise.all([
    db
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
      .orderBy(asc(retailers.name)),
    db
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
      .orderBy(asc(users.name)),
  ]);
  // Only admin adds, edits and turns off shops, picks their sales person and links a login.
  const canEdit = can(user.role, "editRetailers");
  const names = new Map(people.map((u) => [u.id, u.name]));
  const shown = rows.map((r) => ({
    ...r,
    salesRepName: r.salesRepId ? (names.get(r.salesRepId) ?? "") : "",
    loginName: r.userId ? (names.get(r.userId) ?? "") : "",
  }));
  // Retailer logins not linked to any shop yet (each row also keeps its own current login).
  const logins = can(user.role, "linkRetailerLogin")
    ? pickableRetailerLogins(
        people,
        rows.map((r) => r.userId),
      ).map((u) => ({ id: u.id, label: `${u.name} (${u.email})` }))
    : null;
  const salesReps = can(user.role, "assignSalesRep")
    ? pickableSalesReps(people).map((u) => ({ id: u.id, label: u.name }))
    : null;
  return <RetailersView rows={shown} canEdit={canEdit} logins={logins} salesReps={salesReps} />;
}
