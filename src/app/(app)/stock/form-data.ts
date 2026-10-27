import { getCatalogueLists, getProducts } from "@/lib/catalogue";
import { listsUsedBy } from "@/lib/catalogue-rules";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { getBalances } from "@/lib/stock";
import { getPlaces } from "@/lib/stock-places";

/**
 * Shared by the stock forms: role check, all active places, products, balances (`data` goes to the form).
 */
async function loadData(action: "manageStock" | "transferStock" | "recordPurchase") {
  await requireRole(...rolesFor(action));
  const [places, prods, balances] = await Promise.all([getPlaces(), getProducts({ activeOnly: true }), getBalances()]);
  const data = {
    places: places.map((p) => ({ key: p.key, kind: p.kind, name: p.name })),
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
