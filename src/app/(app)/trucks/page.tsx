import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { getTrucks } from "@/lib/trucks";
import { TrucksView } from "./trucks-view";

export default async function TrucksPage() {
  await requireRole(...rolesFor("dispatch"));
  const rows = await getTrucks();
  return <TrucksView rows={rows} />;
}
