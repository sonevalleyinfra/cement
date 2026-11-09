import { getCatalogueLists, getProducts } from "@/lib/catalogue";
import { listsUsedBy } from "@/lib/catalogue-rules";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { getBalances } from "@/lib/stock";
import { getPlaces } from "@/lib/stock-places";
import { getActiveTrucks } from "@/lib/trucks";

/**
 * Shared by the stock forms: role check, all active places, products, balances (`data` goes to the form).
 */
async function loadData(action: "manageStock" | "transferStock" | "recordPurchase") {
  await requireRole(...rolesFor(action));
  const [places, prods, balances, trucks] = await Promise.all([
    getPlaces(),
    getProducts({ activeOnly: true }),
    getBalances(),
    getActiveTrucks(),
  ]);
  const placesMap = new Map<string, { key: string; kind: "godown" | "vehicle"; name: string }>();

  for (const p of places) {
    const formattedName = p.kind === "vehicle" && !p.name.startsWith("Truck ") ? `Truck ${p.name}` : p.name;
    placesMap.set(p.key, { key: p.key, kind: p.kind, name: formattedName });
  }

  // Guarantee that every loaded vehicle from balances is included as a place
  for (const b of balances) {
    if (b.kind === "vehicle" && (b.bags > 0 || b.placeActive) && !placesMap.has(b.placeKey)) {
      placesMap.set(b.placeKey, {
        key: b.placeKey,
        kind: "vehicle",
        name: `Truck ${b.placeName}`,
      });
    }
  }

  const data = {
    places: [...placesMap.values()],
    products: prods.map((p) => ({
      id: p.id,
      name: p.name,
      channel: p.channel,
      brandId: p.brandId,
      brand: p.brand,
      gradeId: p.gradeId,
      bagKg: p.bagKg,
    })),
    balances: balances.map((b) => ({ productId: b.productId, placeKey: b.placeKey, bags: b.bags })),
    trucks,
  };
  return { data };
}

/**
 * For the three admin forms (purchase, opening, adjust), which pick a product with drop-downs:
 * brand (only when there is more than one), trade-type, type, grade. They offer only what existing,
 * switched-on products are made from (products are added in Catalogue, never by these forms).
 */
export async function loadFormData(action: "manageStock" | "recordPurchase" = "recordPurchase") {
  const { data } = await loadData(action);
  const lists = listsUsedBy(await getCatalogueLists(), data.products);
  return {
    ...data,
    lists: {
      brands: lists.brands.map((b) => ({ id: b.id, name: b.name })),
      types: lists.types.map((t) => ({ id: t.id, code: t.code, name: t.name })),
      grades: lists.grades.map((g) => ({ id: g.id, typeId: g.typeId, name: g.name })),
    },
  };
}

/** For moving bags between places: logistics may do it too (admin always passes). */
export async function loadTransferData() {
  return (await loadData("transferStock")).data;
}
