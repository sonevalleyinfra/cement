import { CURRENCY, LOCALE } from "@/lib/locale";

/**
 * Money is ALWAYS stored and calculated as an integer number of paise
 * (₹1 = 100 paise). Never use floating-point rupees for amounts — 0.1 + 0.2
 * is not 0.3 in JavaScript. Store paise in Postgres with `bigint`/`integer`.
 *
 * Convert to rupees only for display (formatINR) and from rupees only when
 * reading user input (parseRupeesToPaise).
 */
export type Paise = number;

function assertPaise(paise: number): void {
  if (!Number.isSafeInteger(paise)) {
    throw new TypeError(`Money must be a whole number of paise, got ${paise}`);
  }
}

const inrFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWholeFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** 12345678 paise → "₹1,23,456.78" (Indian lakh/crore digit grouping). */
export function formatINR(paise: Paise, opts: { hidePaise?: boolean } = {}): string {
  assertPaise(paise);
  if (opts.hidePaise) return inrWholeFormatter.format(Math.round(paise / 100));
  return inrFormatter.format(paise / 100);
}

/**
 * Short form using lakh / crore words: 1_50_00_000 paise → "₹1.5 lakh",
 * 2_50_00_00_000 paise → "₹2.5 crore". Amounts under ₹1 lakh use formatINR.
 */
export function formatINRCompact(paise: Paise): string {
  assertPaise(paise);
  const rupees = Math.abs(paise) / 100;
  const sign = paise < 0 ? "-" : "";
  const short = (value: number) =>
    new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(value);

  if (rupees >= 1_00_00_000) return `${sign}₹${short(rupees / 1_00_00_000)} crore`;
  if (rupees >= 1_00_000) return `${sign}₹${short(rupees / 1_00_000)} lakh`;
  return formatINR(paise);
}

/** Whole rupees → paise. 250 → 25000. */
export function rupeesToPaise(rupees: number): Paise {
  if (!Number.isSafeInteger(rupees)) {
    throw new TypeError("rupeesToPaise expects whole rupees; use parseRupeesToPaise for user input");
  }
  return rupees * 100;
}

/**
 * Parses what a user typed into a paise integer without floating-point maths.
 * Accepts "1,23,456.78", "₹ 500", "99.5", "-20". Returns null if invalid or
 * if it has more than 2 decimal places.
 */
export function parseRupeesToPaise(input: string): Paise | null {
  const cleaned = input.replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const [, minus, whole, fraction = ""] = match;
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) return null;
  return minus ? -paise : paise;
}

/**
 * Splits an amount into `parts` shares that add up exactly to the total.
 * Leftover paise go to the first shares: 100 paise / 3 → [34, 33, 33].
 */
export function splitPaise(total: Paise, parts: number): Paise[] {
  assertPaise(total);
  if (!Number.isInteger(parts) || parts < 1) throw new RangeError("parts must be a positive integer");
  const base = Math.trunc(total / parts);
  const remainder = total - base * parts;
  const step = Math.sign(remainder);
  return Array.from({ length: parts }, (_, i) => base + (i < Math.abs(remainder) ? step : 0));
}

/**
 * Percentage of an amount in basis points (1% = 100 bps), rounded half away
 * from zero to the nearest paisa. 18% GST on ₹999.99 → percentOf(99999, 1800).
 */
export function percentOf(paise: Paise, basisPoints: number): Paise {
  assertPaise(paise);
  if (!Number.isInteger(basisPoints)) throw new TypeError("basisPoints must be an integer");
  const raw = paise * basisPoints;
  const result = Math.sign(raw) * Math.round(Math.abs(raw) / 10_000);
  return result === 0 ? 0 : result; // avoid -0
}
