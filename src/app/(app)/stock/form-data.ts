import { getFirmSelection } from "@/components/app/firm-switcher";
import { getCatalogueLists, getProducts } from "@/lib/catalogue";
import { listsUsedBy } from "@/lib/catalogue-rules";
import { can, rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { getBalances } from "@/lib/stock";
import { getPlaces } from "@/lib/stock-places";

/**
 * Shared by the stock forms: role check, one firm, all active places, products, this firm's balances.
 * `role` is the signed-in user's role; `data` goes to the form.
 */
async function loadData(action: "manageStock" | "transferStock") {
  const session = await requireRole(...rolesFor(action));
  const { selection } = await getFirmSelection();
  if (selection.mode !== "firm") return null;
  const firmId = selection.firmId;
  const [places, prods, balances] = await Promise.all([
    getPlaces({ firmId }),
    getProducts({ activeOnly: true }),
    getBalances(firmId),
  ]);
  const data = {
    firmId,
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
  const loaded = await loadData("manageStock");
  if (!loaded) return null;
  const { role, data } = loaded;
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
  return (await loadData("transferStock"))?.data ?? null;
}
