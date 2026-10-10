/**
 * Rules for the product catalogue. Plain functions: no database, no request.
 *
 * A product is one sellable kind of bag, built from drop-downs in this order:
 *   Brand (Prism) → Channel (Trade / Non-trade) → Type (OPC / PPC) → Grade (33 / 43 / 53) → Bag size.
 * The grade belongs to one type, so a product only stores the grade (the type comes with it).
 * The product name is built from the parts, never typed.
 */
import { LOCALE } from "./locale";

export const PRODUCT_CHANNELS = ["trade", "non_trade"] as const;
export type ProductChannel = (typeof PRODUCT_CHANNELS)[number];

export const CHANNEL_LABELS: Record<ProductChannel, string> = {
  trade: "Trade",
  non_trade: "Non-trade",
};

export function isProductChannel(value: unknown): value is ProductChannel {
  return typeof value === "string" && (PRODUCT_CHANNELS as readonly string[]).includes(value);
}

/** Bag sizes the drop-down offers, in kg. Add a size here to offer it. */
export const BAG_SIZES_KG = [50] as const;
export const DEFAULT_BAG_KG = 50;

export function isBagSize(value: unknown): value is number {
  return typeof value === "number" && (BAG_SIZES_KG as readonly number[]).includes(value);
}

/** "Prism Trade OPC 53". The bag size is added only when it is not the usual 50 kg. */
export function productName(parts: {
  brand: string;
  channel: ProductChannel;
  typeCode: string;
  grade: string;
  bagKg: number;
}): string {
  const size = parts.bagKg === DEFAULT_BAG_KG ? "" : ` ${parts.bagKg}kg`;
  return `${parts.brand} ${CHANNEL_LABELS[parts.channel]} ${parts.typeCode} ${parts.grade}${size}`;
}

/** Trims and joins spaces in a list name (brand, type, grade). Null when empty. */
export function cleanListName(text: string, max = 40): string | null {
  const clean = String(text ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  return clean || null;
}

/** A type code like "OPC" or "PSC": 2 to 10 letters or digits, stored in capitals. */
export function cleanTypeCode(text: string): string | null {
  const code = String(text ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length >= 2 && code.length <= 10 ? code : null;
}

/** True if `name` is already in the list (ignoring capitals and spaces). */
export function isDuplicateName(name: string, existing: readonly string[]): boolean {
  const key = name.trim().replace(/\s+/g, " ").toLowerCase();
  return existing.some((e) => e.trim().replace(/\s+/g, " ").toLowerCase() === key);
}

type Item = { id: string; active: boolean };
export type CatalogueLookups = {
  brands: readonly (Item & { name: string })[];
  types: readonly (Item & { code: string })[];
  grades: readonly (Item & { typeId: string; name: string })[];
  products: readonly { brandId: string; channel: string; gradeId: string; bagKg: number }[];
};

export type NewProductInput = {
  brandId: string;
  channel: string;
  typeId: string;
  gradeId: string;
  bagKg: number;
};

export type NewProduct = {
  brandId: string;
  channel: ProductChannel;
  gradeId: string;
  bagKg: number;
  name: string;
};

/** Checks a new product made from the drop-downs and builds its name. */
export function validateNewProduct(
  input: NewProductInput,
  lookups: CatalogueLookups,
): { ok: true; value: NewProduct } | { ok: false; error: string } {
  const brand = lookups.brands.find((b) => b.id === input.brandId);
  if (!brand || !brand.active) return { ok: false, error: "Pick a brand." };
  if (!isProductChannel(input.channel)) return { ok: false, error: "Pick trade or non-trade." };
  const type = lookups.types.find((t) => t.id === input.typeId);
  if (!type || !type.active) return { ok: false, error: "Pick a type." };
  const grade = lookups.grades.find((g) => g.id === input.gradeId);
  if (!grade || !grade.active || grade.typeId !== type.id) return { ok: false, error: "Pick a grade." };
  if (!isBagSize(input.bagKg)) return { ok: false, error: "Pick a bag size." };
  const dup = lookups.products.some(
    (p) =>
      p.brandId === brand.id && p.channel === input.channel && p.gradeId === grade.id && p.bagKg === input.bagKg,
  );
  if (dup) return { ok: false, error: "This product already exists." };
  return {
    ok: true,
    value: {
      brandId: brand.id,
      channel: input.channel,
      gradeId: grade.id,
      bagKg: input.bagKg,
      name: productName({ brand: brand.name, channel: input.channel, typeCode: type.code, grade: grade.name, bagKg: input.bagKg }),
    },
  };
}

/** Total weight in kg. Whole numbers only: bags × kg per bag. */
export function bagsToKg(bags: number, bagKg: number): number {
  return bags * bagKg;
}

/** kg shown as tonnes: 1250 → "1.25 MT", 20000 → "20 MT". */
export function formatTonnes(kg: number): string {
  const tonnes = (kg / 1000).toLocaleString(LOCALE, { maximumFractionDigits: 2 });
  return `${tonnes} MT`;
}

/** Products for a drop-down, in Trade / Non-trade sections (empty sections left out). Keeps the given order. */
export function productGroups(
  products: readonly { id: string; name: string; channel: string }[],
): { label: string; options: { value: string; label: string }[] }[] {
  return PRODUCT_CHANNELS.map((channel) => ({
    label: CHANNEL_LABELS[channel],
    options: products.filter((p) => p.channel === channel).map((p) => ({ value: p.id, label: p.name })),
  })).filter((g) => g.options.length > 0);
}

/** A product can be switched off only when no firm holds any of its bags (else they could not be moved or sold). */
export function canSwitchOffProduct(bagsInStock: number): { ok: true } | { ok: false; error: string } {
  return bagsInStock > 0 ? { ok: false, error: "Bags still in stock." } : { ok: true };
}

type PartsKey = { brandId: string; channel: string; gradeId: string; bagKg: number };

/** The product made from these drop-down choices, if there is one. */
export function findProductByParts<P extends PartsKey>(products: readonly P[], parts: PartsKey): P | undefined {
  return products.find(
    (p) =>
      p.brandId === parts.brandId && p.channel === parts.channel && p.gradeId === parts.gradeId && p.bagKg === parts.bagKg,
  );
}

export type ProductLookups = Omit<CatalogueLookups, "products"> & {
  products: readonly (PartsKey & { id: string; active: boolean })[];
};

export type ResolvedProduct =
  | { ok: true; kind: "existing"; id: string }
  | { ok: true; kind: "reactivate"; id: string }
  | { ok: true; kind: "create"; value: NewProduct }
  | { ok: false; error: string };

/**
 * Which product the four stock drop-downs (brand, trade-type, type, grade) point to.
 * An active product is used as it is. A missing or switched-off one is made / switched back on,
 * but only when `allowCreate` (a purchase by someone who may manage the catalogue);
 * then its brand, type and grade must all be switched on.
 */
export function resolveProduct(input: NewProductInput, lookups: ProductLookups, allowCreate: boolean): ResolvedProduct {
  const grade = lookups.grades.find((g) => g.id === input.gradeId);
  if (!grade || grade.typeId !== input.typeId) return { ok: false, error: "Pick a grade." };
  const found = findProductByParts(lookups.products, input);
  if (found?.active) return { ok: true, kind: "existing", id: found.id };
  if (!allowCreate) return { ok: false, error: found ? "Pick an active product." : "Not in catalogue." };
  const check = validateNewProduct(input, { ...lookups, products: [] });
  if (!check.ok) return check;
  return found ? { ok: true, kind: "reactivate", id: found.id } : { ok: true, kind: "create", value: check.value };
}

type ListItems<B, T, G> = { brands: readonly B[]; types: readonly T[]; grades: readonly G[] };

/** Only the brands, types and grades some of these products are made from (for forms that never add products). */
export function listsUsedBy<B extends { id: string }, T extends { id: string }, G extends { id: string; typeId: string }>(
  lists: ListItems<B, T, G>,
  products: readonly { brandId: string; gradeId: string }[],
): { brands: B[]; types: T[]; grades: G[] } {
  const brandIds = new Set(products.map((p) => p.brandId));
  const grades = lists.grades.filter((g) => products.some((p) => p.gradeId === g.id));
  const typeIds = new Set(grades.map((g) => g.typeId));
  return {
    brands: lists.brands.filter((b) => brandIds.has(b.id)),
    types: lists.types.filter((t) => typeIds.has(t.id)),
    grades,
  };
}

/**
 * The names to change after a brand, type or grade was renamed. Each row is a product with its
 * current parts; only products whose built name differs are returned.
 */
export function renamedProducts(
  rows: readonly { id: string; name: string; brand: string; channel: string; typeCode: string; grade: string; bagKg: number }[],
): { id: string; name: string }[] {
  return rows
    .filter((r) => isProductChannel(r.channel))
    .map((r) => ({
      id: r.id,
      old: r.name,
      name: productName({ ...r, channel: r.channel as ProductChannel }),
    }))
    .filter((r) => r.name !== r.old)
    .map(({ id, name }) => ({ id, name }));
}
