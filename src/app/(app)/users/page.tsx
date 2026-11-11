import { asc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { rolesFor } from "@/lib/permissions";
import { pickableSalesReps } from "@/lib/sales-rep-rules";
import { requireRole } from "@/lib/session";
import { UsersView } from "./users-view";

export default async function UsersPage() {
  const { user: me } = await requireRole(...rolesFor("manageUsers"));
  const users = await db
    .select({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, banned: user.banned })
    .from(user)
    .where(isNull(user.deletedAt))
    .orderBy(asc(user.name));
  const rows = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role ?? "",
    active: !u.banned,
  }));
  const salesReps = pickableSalesReps(
    users.map((u) => ({ id: u.id, name: u.name, role: u.role, banned: u.banned, deletedAt: null })),
  ).map((u) => ({ id: u.id, name: u.name }));
  return <UsersView rows={rows} myId={me.id} salesReps={salesReps} />;
}
