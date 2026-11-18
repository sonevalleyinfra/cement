import { backFor } from "@/lib/nav-rules";
import { requireRole } from "@/lib/session";
import { getTrucks } from "@/lib/trucks";
import { TrucksView } from "./trucks-view";

export default async function TrucksPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { user } = await requireRole("admin", "logistics", "accounts");
  const sp = searchParams ? await searchParams : undefined;
  const rows = await getTrucks();
  return <TrucksView rows={rows} initialTab={sp?.tab} back={backFor(user.role, "/trucks")} />;
}
