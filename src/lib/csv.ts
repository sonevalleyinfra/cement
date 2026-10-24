/**
 * CSV for report downloads, as plain functions (no database).
 *
 * - The file starts with a UTF-8 BOM so Excel reads ₹ and names correctly, and lines end with CRLF.
 * - Text that starts with = + - @ TAB or CR gets a leading ' so a spreadsheet never runs it as a formula.
 *   Numbers are passed as `number` and are never changed.
 * - Money is written as plain rupees with 2 decimals ("1234.50") by `rupees`, using integer maths only.
 */
const BOM = "﻿";

/** One cell as CSV text: formula guard first, then quotes when it holds , " CR or LF. */
export function csvCell(value: string | number): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`CSV number must be finite, got ${value}`);
    return String(value);
  }
  // A plain money amount from `rupees` ("-12.50") is a number, not a formula, so it stays as it is.
  const text = /^[=+\-@\t\r]/.test(value) && !/^-\d+\.\d{2}$/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The whole file: BOM, then each row with CRLF at the end of every line. */
export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  return BOM + rows.map((r) => r.map(csvCell).join(",") + "\r\n").join("");
}

/** 123450 paise → "1234.50"; −5 → "-0.05". No symbol, no commas. A number, not text, so it is never guarded. */
export function rupees(paise: number): string {
  if (!Number.isSafeInteger(paise)) throw new TypeError(`Money must be a whole number of paise, got ${paise}`);
  const abs = Math.abs(paise);
  const text = `${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return paise < 0 ? `-${text}` : text;
}
