/**
 * Rules for the product catalogue. Plain functions: no database, no request.
 *
 * A product is one sellable kind of bag, built from drop-downs in this order:
 *   Brand (Prism; admin adds more) → Channel (Trade / Non-trade) → Type (OPC / PPC) → Grade (33 / 43 / 53) → Bag size.
 * (docs/idea.md section 2.) With only one switched-on brand, screens pick it without asking
 * (`hasManyBrands`); the brand still shows in every product name ("Prism Trade OPC 43").
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

/**
 * The product name for a narrow table: "Trade OPC 43" instead of "Prism Trade OPC 43". The brand is
 * kept only when more than one brand is switched on (`showBrand`), because only then it tells products apart.
 */
export function shortProductName(name: string, brandNames: readonly string[], showBrand: boolean): string {
  if (showBrand) return name;
  const brand = [...brandNames]
    .sort((a, b) => b.length - a.length)
    .find((b) => b !== "" && name.startsWith(`${b} `));
  return brand ? name.slice(brand.length + 1) : name;
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
type Brand = Item & { name: string };
export type CatalogueLookups = {
  brands: readonly Brand[];
  types: readonly (Item & { code: string })[];
  grades: readonly (Item & { typeId: string; name: string })[];
  products: readonly { brandId: string; channel: string; gradeId: string; bagKg: number }[];
};

/**
 * True when there is more than one brand to pick from. With one, screens skip the Brand drop-down
 * (that brand is picked) and do not group products by brand.
 */
export function hasManyBrands(brands: readonly unknown[]): boolean {
  return brands.length > 1;
}

/** The brand a form starts on: the one picked before if it is still in the list, else the first. */
export function startBrand(brands: readonly { id: string }[], picked?: string | null): string {
  return brands.some((b) => b.id === picked) ? (picked as string) : (brands[0]?.id ?? "");
}

/** The product picked with the drop-downs. */
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
  if (findProductByParts(lookups.products, input)) return { ok: false, error: "This product already exists." };
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

/**
 * Products for a drop-down, in Trade / Non-trade sections (empty sections left out). Keeps the given order.
 * When the products come from more than one brand, each section is one brand's Trade or Non-trade
 * ("Prism · Trade"), brands in the order they first appear.
 */
export function productGroups(
  products: readonly { id: string; name: string; channel: string; brand?: string }[],
): { label: string; options: { value: string; label: string }[] }[] {
  const brandNames = [...new Set(products.map((p) => p.brand ?? ""))];
  const many = hasManyBrands(brandNames);
  return brandNames
    .flatMap((brand) =>
      PRODUCT_CHANNELS.map((channel) => ({
        label: many ? `${brand} · ${CHANNEL_LABELS[channel]}` : CHANNEL_LABELS[channel],
        options: products
          .filter((p) => p.channel === channel && (p.brand ?? "") === brand)
          .map((p) => ({ value: p.id, label: p.name })),
      })),
    )
    .filter((g) => g.options.length > 0);
}

/** A product can be switched off only when none of its bags are in stock (else they could not be moved or sold). */
export function canSwitchOffProduct(bagsInStock: number): { ok: true } | { ok: false; error: string } {
  return bagsInStock > 0 ? { ok: false, error: "Bags still in stock." } : { ok: true };
}

/** A product can be switched back on only while its brand is on. */
export function canSwitchOnProduct(brandActive: boolean): { ok: true } | { ok: false; error: string } {
  return brandActive ? { ok: true } : { ok: false, error: "Switch its brand on first." };
}

/**
 * A brand can be switched off only when it has no switched-on products and no bags in stock
 * (else they could not be sold, moved or bought). Its supplier account stays as it is.
 */
export function canSwitchOffBrand(brand: {
  activeProducts: number;
  bagsInStock: number;
}): { ok: true } | { ok: false; error: string } {
  if (brand.bagsInStock > 0) return { ok: false, error: "Bags still in stock." };
  if (brand.activeProducts > 0) return { ok: false, error: "Switch its products off first." };
  return { ok: true };
}

type PartsKey = { brandId: string; channel: string; gradeId: string; bagKg: number };

/** The product made from these drop-down choices, if there is one. */
export function findProductByParts<P extends PartsKey>(products: readonly P[], parts: PartsKey): P | undefined {
  return products.find(
    (p) =>
      p.brandId === parts.brandId && p.channel === parts.channel && p.gradeId === parts.gradeId && p.bagKg === parts.bagKg,
  );
}

/**
 * The product the stock drop-downs (brand, trade-type, type, grade) point to. Only an existing,
 * switched-on product is used: stock forms never make products (that is done in Catalogue).
 */
export function resolveProduct(
  input: NewProductInput,
  lookups: {
    grades: readonly { id: string; typeId: string }[];
    products: readonly (PartsKey & { id: string; active: boolean })[];
  },
): { ok: true; id: string } | { ok: false; error: string } {
  const grade = lookups.grades.find((g) => g.id === input.gradeId);
  if (!grade || grade.typeId !== input.typeId) return { ok: false, error: "Pick a grade." };
  const found = findProductByParts(lookups.products, input);
  if (!found) return { ok: false, error: "Not in catalogue. Add the product in Catalogue first." };
  if (!found.active) return { ok: false, error: "Pick an active product." };
  return { ok: true, id: found.id };
}

export type ProductPick = { brandId: string; channel: string; typeId: string; gradeId: string };

/**
 * The stock forms' product drop-downs, narrowed step by step to products that exist:
 * the brand's trade-types, then the types made in that trade-type, then their grades.
 * A pick that is not offered (for example after switching brand) falls back to the first offered
 * one, so the drop-downs always point at an existing product (or nothing, when the brand has none).
 * `types` / `grades` give the order of the lists.
 */
export function pickProductParts<P extends PartsKey & { id: string }>(
  products: readonly P[],
  types: readonly { id: string }[],
  grades: readonly { id: string; typeId: string }[],
  pick: ProductPick,
): ProductPick & { channels: ProductChannel[]; typeIds: string[]; gradeIds: string[]; product: P | null } {
  const typeOf = new Map(grades.map((g) => [g.id, g.typeId]));
  const mine = products.filter((p) => p.brandId === pick.brandId && p.bagKg === DEFAULT_BAG_KG);
  const channels = PRODUCT_CHANNELS.filter((c) => mine.some((p) => p.channel === c));
  const channel = (channels as readonly string[]).includes(pick.channel) ? pick.channel : (channels[0] ?? "");
  const inChannel = mine.filter((p) => p.channel === channel);
  const typeIds = types.map((t) => t.id).filter((id) => inChannel.some((p) => typeOf.get(p.gradeId) === id));
  const typeId = typeIds.includes(pick.typeId) ? pick.typeId : (typeIds[0] ?? "");
  const gradeIds = grades
    .filter((g) => g.typeId === typeId && inChannel.some((p) => p.gradeId === g.id))
    .map((g) => g.id);
  const gradeId = gradeIds.includes(pick.gradeId) ? pick.gradeId : (gradeIds[0] ?? "");
  const product = inChannel.find((p) => p.gradeId === gradeId) ?? null;
  return { brandId: pick.brandId, channel, typeId, gradeId, channels, typeIds, gradeIds, product };
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
