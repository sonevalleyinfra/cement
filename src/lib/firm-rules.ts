/** Rules for adding, editing and removing firms. Plain functions: no database, no request. */
import { isValidIndianMobile, normalizePhone } from "./retailer-rules";

/** Accent colours a firm can get. Shown only as the dot in the firm chip. */
export const FIRM_SLOTS = ["a", "b", "c", "d", "e", "f"] as const;
export type FirmSlot = (typeof FIRM_SLOTS)[number];

export const FIRM_NAME_MAX = 60;

/** Uppercase with spaces removed: "10 aabcu 9603r1zx" becomes "10AABCU9603R1ZX". */
export function normalizeGstin(input: string): string {
  return input.toUpperCase().replace(/\s/g, "");
}

/**
 * GSTIN shape: 2-digit state code, 10-character PAN (5 letters, 4 digits, 1 letter),
 * entity number (1-9 or a letter), the letter Z, and a check character.
 */
export function isValidGstin(gstin: string): boolean {
  return /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin);
}

export type FirmInput = { name: string; ownerName: string; phone: string; gstin: string; address: string };

export type FirmCheck =
  | { ok: true; value: FirmInput }
  | { ok: false; errors: Partial<Record<keyof FirmInput, string>> };

const oneLine = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ");

/** Trims and checks the firm form. Only the name is required; phone and GSTIN are checked when given. */
export function validateFirm(raw: {
  name?: string | null;
  ownerName?: string | null;
  phone?: string | null;
  gstin?: string | null;
  address?: string | null;
}): FirmCheck {
  const name = oneLine(raw.name);
  const ownerName = oneLine(raw.ownerName);
  const phone = normalizePhone(raw.phone ?? "");
  const gstin = normalizeGstin(raw.gstin ?? "");
  const address = (raw.address ?? "").trim();
  const errors: Partial<Record<keyof FirmInput, string>> = {};
  if (!name) errors.name = "Enter the firm name";
  else if (name.length > FIRM_NAME_MAX) errors.name = `Name is too long (${FIRM_NAME_MAX} letters max)`;
  if (phone && !isValidIndianMobile(phone)) errors.phone = "Enter a 10-digit mobile";
  if (gstin && !isValidGstin(gstin)) errors.gstin = "Enter a valid 15-character GSTIN";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, ownerName, phone, gstin, address } };
}

/** True if another firm (not `selfId`) already has this name, ignoring upper/lower case. */
export function isDuplicateFirmName(
  name: string,
  existing: readonly { id: string; name: string }[],
  selfId?: string,
): boolean {
  const wanted = name.toLowerCase();
  return existing.some((f) => f.id !== selfId && f.name.toLowerCase() === wanted);
}

/**
 * Colour for a new (or restored) firm: the first one no active firm uses.
 * When all are taken, the one used by the fewest firms (earliest in the list on a tie).
 */
export function pickFirmSlot(activeSlots: readonly string[]): FirmSlot {
  let best: FirmSlot = FIRM_SLOTS[0];
  let bestCount = Infinity;
  for (const slot of FIRM_SLOTS) {
    const count = activeSlots.filter((s) => s === slot).length;
    if (count < bestCount) {
      best = slot;
      bestCount = count;
    }
  }
  return best;
}

/** A firm can be removed only while at least one other firm stays active. Returns an error or null. */
export function checkRemoveFirm(activeFirmIds: readonly string[], firmId: string): string | null {
  if (!activeFirmIds.includes(firmId)) return "Firm is already removed";
  if (activeFirmIds.length <= 1) return "Keep at least one firm";
  return null;
}

/** Orders in these statuses are still being worked on ("dispatched" = on the truck, not yet delivered). */
export const OPEN_ORDER_STATUSES = [
  "placed",
  "rate_filled",
  "approved",
  "assigned",
  "partly_dispatched",
  "dispatched",
] as const;

/** What is still open for a firm. Every number is a count (0 = nothing open). */
export type OpenBusiness = {
  /** Places that still hold (or owe) bags of any product. */
  stockPlaces: number;
  /** Retailers whose ledger balance with this firm is not zero. */
  retailersWithBalance: number;
  /** Collectors still holding this firm's cash. */
  collectorsHoldingCash: number;
  /** Cash handover requests nobody has answered yet. */
  openHandoverRequests: number;
  /** Orders not yet delivered, rejected or cancelled. */
  openOrders: number;
  /** Online payments accounts has not verified yet (received by this firm or paying it). */
  unverifiedOnline: number;
  /** Cheques not yet cleared or bounced (received by this firm or paying it). */
  pendingCheques: number;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Removing a firm hides it everywhere, so it must not hide money or bags still open.
 * Returns an error listing what is still open, or null when the firm can go.
 */
export function openBusinessProblem(open: OpenBusiness): string | null {
  const parts: string[] = [];
  if (open.stockPlaces > 0) parts.push(`stock in ${plural(open.stockPlaces, "place", "places")}`);
  if (open.retailersWithBalance > 0) {
    parts.push(`${plural(open.retailersWithBalance, "retailer", "retailers")} with a balance`);
  }
  if (open.collectorsHoldingCash > 0) {
    parts.push(`cash with ${plural(open.collectorsHoldingCash, "collector", "collectors")}`);
  }
  if (open.openHandoverRequests > 0) {
    parts.push(plural(open.openHandoverRequests, "handover request", "handover requests"));
  }
  if (open.openOrders > 0) parts.push(plural(open.openOrders, "open order", "open orders"));
  if (open.unverifiedOnline > 0) {
    parts.push(plural(open.unverifiedOnline, "unverified online payment", "unverified online payments"));
  }
  if (open.pendingCheques > 0) parts.push(plural(open.pendingCheques, "pending cheque", "pending cheques"));
  if (parts.length === 0) return null;
  return `Cannot remove this firm yet. Still open: ${parts.join(", ")}.`;
}

/**
 * Who gets access to a newly added firm: everyone who already works on at least one
 * active firm, whatever their role (sales, accounts, logistics, retailer).
 * `links` are the rows of `user_firms`. Each user appears once.
 */
export function usersForNewFirm(
  links: readonly { userId: string; firmId: string }[],
  activeFirmIds: readonly string[],
): string[] {
  const active = new Set(activeFirmIds);
  return [...new Set(links.filter((l) => active.has(l.firmId)).map((l) => l.userId))];
}
