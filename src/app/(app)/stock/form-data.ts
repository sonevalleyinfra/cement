import { getFirmSelection } from "@/components/app/firm-switcher";
import { getProducts } from "@/lib/catalogue";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { getBalances } from "@/lib/stock";
import { getPlaces } from "@/lib/stock-places";

/** Shared by the stock forms: role check, one firm, all active places, products, this firm's balances. */
async function loadData(action: "manageStock" | "transferStock") {
  await requireRole(...rolesFor(action));
  const { selection } = await getFirmSelection();
  if (selection.mode !== "firm") return null;
  const firmId = selection.firmId;
  const [places, prods, balances] = await Promise.all([
    getPlaces({ activeOnly: true }),
    getProducts({ activeOnly: true }),
    getBalances(firmId),
  ]);
  return {
    firmId,
    places: places.map((p) => ({ key: p.key, kind: p.kind, name: p.name })),
    products: prods.map((p) => ({ id: p.id, name: p.name, channel: p.channel })),
    balances: balances.map((b) => ({ productId: b.productId, placeKey: b.placeKey, bags: b.bags })),
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
