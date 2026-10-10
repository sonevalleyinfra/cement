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
