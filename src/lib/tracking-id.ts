import { randomBytes } from "node:crypto";
import { toISTDateKey } from "./datetime";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 4;

export type TrackingPrefix = "TRK" | "DSP";

/**
 * Generates a human-readable unique tracking ID:
 *   - `TRK-YYMMDD-XXXX` for truck/stock purchases (e.g. `TRK-261112-9K4M`)
 *   - `DSP-YYMMDD-XXXX` for godown dispatches (e.g. `DSP-261112-4A9C`)
 * Uses IST calendar date + 4 unambiguous uppercase alphanumeric chars (no 0/O/1/I).
 */
export function generateTrackingId(prefix: TrackingPrefix, now: Date = new Date(), bytes?: Uint8Array): string {
  const yymmdd = toISTDateKey(now).replace(/-/g, "").slice(2, 8);
  const buf = bytes ?? randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[buf[i]! % ALPHABET.length];
  }
  return `${prefix}-${yymmdd}-${code}`;
}

export function isTrackingId(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^(TRK|DSP)-\d{6}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/.test(value.trim().toUpperCase());
}
