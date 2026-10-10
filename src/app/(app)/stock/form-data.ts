import { getCatalogueLists, getProducts } from "@/lib/catalogue";
import { listsUsedBy } from "@/lib/catalogue-rules";
import { can, rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { getBalances } from "@/lib/stock";
import { getPlaces } from "@/lib/stock-places";

/**
 * Shared by the stock forms: role check, all active places, products, balances.
 * `role` is the signed-in user's role; `data` goes to the form.
 */
async function loadData(action: "manageStock" | "transferStock") {
  const session = await requireRole(...rolesFor(action));
  const [places, prods, balances] = await Promise.all([getPlaces(), getProducts({ activeOnly: true }), getBalances()]);
  const data = {
    places: places.map((p) => ({ key: p.key, kind: p.kind, name: p.name })),
    products: prods.map((p) => ({
      id: p.id,
      name: p.name,
      channel: p.channel,
      brandId: p.brandId,
      gradeId: p.gradeId,
      bagKg: p.bagKg,
    })),
    balances: balances.map((b) => ({ productId: b.productId, placeKey: b.placeKey, bags: b.bags })),
  };
  return { role: session.user.role, data };
}

/**
 * For the three admin forms (purchase, opening, adjust), which pick a product with four drop-downs.
 * A purchase offers every switched-on brand, type and grade (a new combination becomes a new product);
 * opening and adjust offer only what existing products are made from.
 */
export async function loadFormData(mode: "purchase" | "opening" | "adjust") {
  const { role, data } = await loadData("manageStock");
  const all = await getCatalogueLists();
  const lists =
    mode === "purchase"
      ? {
          brands: all.brands.filter((b) => b.active),
          types: all.types.filter((t) => t.active),
          grades: all.grades.filter((g) => g.active),
        }
      : listsUsedBy(all, data.products);
  return {
    ...data,
    lists: {
      brands: lists.brands.map((b) => ({ id: b.id, name: b.name })),
      types: lists.types.map((t) => ({ id: t.id, code: t.code, name: t.name })),
      grades: lists.grades.map((g) => ({ id: g.id, typeId: g.typeId, name: g.name })),
    },
    canManageCatalogue: mode === "purchase" && can(role, "manageCatalogue"),
  };
}

/** For moving bags between places: logistics may do it too (admin always passes). */
export async function loadTransferData() {
  return (await loadData("transferStock")).data;
}
