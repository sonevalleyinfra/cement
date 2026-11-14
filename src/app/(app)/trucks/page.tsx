import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { getTrucks } from "@/lib/trucks";
import { TrucksView } from "./trucks-view";

export default async function TrucksPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  await requireRole(...rolesFor("dispatch"));
  const sp = searchParams ? await searchParams : undefined;
  const rows = await getTrucks();
  return <TrucksView rows={rows} initialTab={sp?.tab} />;
}
