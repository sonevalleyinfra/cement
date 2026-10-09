import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { firms } from "@/db/schema";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { FirmsView } from "./firms-view";

export default async function FirmsPage() {
  await requireRole(...rolesFor("manageFirms"));
  const rows = await db
    .select({
      id: firms.id,
      name: firms.name,
      slot: firms.slot,
      ownerName: firms.ownerName,
      phone: firms.phone,
      gstin: firms.gstin,
      address: firms.address,
      active: firms.active,
    })
    .from(firms)
    .orderBy(desc(firms.active), asc(firms.createdAt), asc(firms.slot));
  return <FirmsView rows={rows} />;
}
