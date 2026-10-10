import { and, asc, eq } from "drizzle-orm";
import { getFirmSelection } from "@/components/app/firm-switcher";
import { db } from "@/db";
import { stockLocations } from "@/db/schema";
import { getProducts } from "@/lib/catalogue";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { getBalances } from "@/lib/stock";

/** Shared by the stock forms: role check, one firm, its places, products, balances. */
async function loadData(action: "manageStock" | "transferStock") {
  await requireRole(...rolesFor(action));
  const { selection } = await getFirmSelection();
  if (selection.mode !== "firm") return null;
  const firmId = selection.firmId;
  const [places, prods, balances] = await Promise.all([
    db
      .select()
      .from(stockLocations)
      .where(and(eq(stockLocations.firmId, firmId), eq(stockLocations.active, true)))
      .orderBy(asc(stockLocations.kind), asc(stockLocations.name)),
    getProducts({ activeOnly: true }),
    getBalances(firmId),
  ]);
  return {
    firmId,
    places: places.map((l) => ({ id: l.id, name: `${l.kind === "vehicle" ? "Vehicle " : ""}${l.name}` })),
    products: prods.map((p) => ({ id: p.id, name: p.name, channel: p.channel })),
    balances: balances.map((b) => ({ productId: b.productId, locationId: b.locationId, bags: b.bags })),
  };
}

/** For the three admin forms (purchase, opening, adjust). */
export function loadFormData() {
  return loadData("manageStock");
}

/** For moving bags between places: logistics may do it too (admin always passes). */
export function loadTransferData() {
  return loadData("transferStock");
}
