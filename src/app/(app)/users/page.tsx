import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { firms, user, userFirms } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { UsersView } from "./users-view";

export default async function UsersPage() {
  const { user: me } = await requireRole("admin");
  const [users, firmList, links] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, email: user.email, role: user.role, banned: user.banned })
      .from(user)
      .orderBy(asc(user.name)),
    db.select({ id: firms.id, name: firms.name }).from(firms).where(eq(firms.active, true)).orderBy(asc(firms.slot)),
    db.select().from(userFirms),
  ]);
  const rows = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role ?? "",
    active: !u.banned,
    firmIds: links.filter((l) => l.userId === u.id).map((l) => l.firmId),
  }));
  return <UsersView rows={rows} firms={firmList} myId={me.id} />;
}
