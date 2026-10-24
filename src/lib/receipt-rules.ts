/**
 * Payment (receipt) rules as plain functions (no database) so they are easy to test.
 * Source: docs/idea.md section 6 (Payments from retailers) and section 5 (Retailer dues).
 *
 * - Two modes: cash and online. Money is integer paise.
 * - Cash: saved as "received". The retailer's dues go down at once (one `receipt_credit`
 *   ledger row of minus the amount) and the cash is now held by the person who recorded it
 *   (one "collected" wallet row, see wallet-rules.ts).
 * - Online: needs a UTR / reference (an optional note too). Saved as "unverified"; the dues
 *   do NOT change. Accounts (or admin) check the bank statement and tap "Verified": status
 *   "verified" and the ledger credit is posted then. Or they reject it with a reason (the money
 *   never arrived): status "rejected", nothing is posted.
 * - A UTR may be used by one online payment only (rejected and reversed ones do not count, so the
 *   money can be recorded again with the same UTR).
 * - Online also records the method (UPI / NEFT / RTGS / IMPS), the firm's bank account it came into
 *   (admin list, bank-account-rules.ts) and an optional payer name. Old online rows have none of them.
 * - Every payment has a "received on" day (India). Staff may pick today or up to 2 days back; admin
 *   any past day, but older than 2 days needs a backdate reason (reason-codes.ts, backdate list).
 *   The ledger, aging, statement and "last payment" use that day (see `paymentMoment`).
 * - "received" and "verified" payments can later be reversed (see receipt-reversal.ts).
 * - Paying more than the dues is fine: the balance goes below zero (an advance).
 *
 * Choices where the spec is silent:
 * - "Verified" is one tap; accounts compare the UTR shown on the card with the statement.
 * - UTRs are stored without spaces and in capitals, so "abc 123" and "ABC123" are the same.
 */
import { toISTDateKey } from "./datetime";
import { isUuid } from "./ids";
import type { LedgerEntry } from "./ledger-rules";
import { checkReason as checkReasonCode, isReasonCode, type BackdateReasonCode, type PaymentReasonCode } from "./reason-codes";
import { addDays, daysBetween, istStartOf } from "./report-range";
import { hasAnyRole, isAdmin } from "./roles";
import { checkEntryDate } from "./supplier-rules";

export const PAYMENT_MODES = ["cash", "online"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/** cash: received. online: unverified -> verified | rejected. received / verified -> reversed. */
export const RECEIPT_STATUSES = ["received", "unverified", "verified", "rejected", "reversed"] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export const MODE_LABELS: Record<string, string> = { cash: "Cash", online: "Online" };

/** How an online payment was sent. */
export const ONLINE_METHODS = ["upi", "neft", "rtgs", "imps"] as const;
export type OnlineMethod = (typeof ONLINE_METHODS)[number];

export const ONLINE_METHOD_LABELS: Record<string, string> = { upi: "UPI", neft: "NEFT", rtgs: "RTGS", imps: "IMPS" };

export function isOnlineMethod(value: unknown): value is OnlineMethod {
  return typeof value === "string" && (ONLINE_METHODS as readonly string[]).includes(value);
}

export const MAX_PAYER_NAME = 80;

export type Result = { ok: true } | { ok: false; error: string };

/** Status word and the colour of the status chip (which uses the order colours). */
export function receiptChip(status: string): {
  status: "placed" | "approved" | "rejected" | "cancelled";
  label: string;
} {
  switch (status) {
    case "received":
      return { status: "approved", label: "Cash recorded" };
    case "unverified":
      return { status: "placed", label: "Not verified" };
    case "verified":
      return { status: "approved", label: "Verified" };
    case "rejected":
      return { status: "rejected", label: "Rejected" };
    case "reversed":
      return { status: "cancelled", label: "Reversed" };
    default:
      return { status: "placed", label: status };
  }
}

/** Longest reason or note we keep. */
export const MAX_REASON = 300;

/** A reason is required (trimmed, at most 300 characters). */
export function checkReason(reason: unknown): { ok: true; reason: string } | { ok: false; error: string } {
  const clean = typeof reason === "string" ? reason.trim() : "";
  if (!clean) return { ok: false, error: "Enter the reason." };
  if (clean.length > MAX_REASON) return { ok: false, error: `Keep the reason under ${MAX_REASON} characters.` };
  return { ok: true, reason: clean };
}

/** The one stored form of a UTR: no spaces, capitals. */
export function normaliseUtr(utr: string | null | undefined): string {
  return (utr ?? "").replace(/\s+/g, "").toUpperCase();
}

export const MAX_UTR = 40;

/** Online needs a UTR / reference; cash needs nothing. Returns an error or null. */
export function validateModeDetails(mode: string, d: { utr?: string | null }): string | null {
  if (mode === "cash") return null;
  if (mode === "online") {
    const utr = normaliseUtr(d.utr);
    if (!utr) return "Enter the UTR / reference number.";
    if (utr.length > MAX_UTR) return "That UTR is too long.";
    return null;
  }
  return "Pick a payment mode: cash or online.";
}

/** Largest payment we accept: ₹100 crore (a typo guard, not a real business limit). */
export const MAX_RECEIPT_PAISE = 100 * 1_00_00_000 * 100;

/** The amount must be whole paise above zero (and not absurdly large). Returns an error or null. */
export function checkReceiptAmount(totalPaise: number): string | null {
  if (!Number.isSafeInteger(totalPaise) || totalPaise <= 0) return "Enter the amount received.";
  if (totalPaise > MAX_RECEIPT_PAISE) return "That amount is too large.";
  return null;
}

/** A payment in one of these states no longer holds its UTR (same list as the database's unique index). */
export const UTR_FREED_STATUSES = ["rejected", "reversed"] as const;

/** True if this UTR is already used by an online payment that still stands (not rejected or reversed). */
export function isUtrTaken(
  utr: string,
  existing: readonly { mode: string; status: string; utr: string | null }[],
): boolean {
  const wanted = normaliseUtr(utr);
  if (!wanted) return false;
  return existing.some(
    (p) =>
      p.mode === "online" &&
      !(UTR_FREED_STATUSES as readonly string[]).includes(p.status) &&
      normaliseUtr(p.utr) === wanted,
  );
}

export const UTR_TAKEN = "This UTR is already recorded.";

/* ---------- Online details ---------- */

export const PICK_METHOD = "Pick UPI, NEFT, RTGS or IMPS.";
export const PICK_ACCOUNT = "Pick the account it came into.";

/** Online needs a method and the account it came into; the payer name is optional. Returns an error or null. */
export function checkOnlineDetails(d: { onlineMethod?: unknown; bankAccountId?: unknown; payerName?: unknown }): string | null {
  if (!isOnlineMethod(d.onlineMethod)) return PICK_METHOD;
  if (!isUuid(d.bankAccountId)) return PICK_ACCOUNT;
  if (cleanPayerName(d.payerName).length > MAX_PAYER_NAME) return `Keep the payer name under ${MAX_PAYER_NAME} characters.`;
  return null;
}

/** A payer name: trimmed, inner spaces collapsed. */
export function cleanPayerName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

/* ---------- Received on (the day the money came) ---------- */

/** Staff may pick today or up to this many days back. */
export const STAFF_BACKDATE_DAYS = 2;
export const RECEIVED_ON_RANGE = "Pick today or up to 2 days back.";
export const PICK_BACKDATE_REASON = "Pick a reason for the older date.";

export type Backdate = { code: BackdateReasonCode; note: string };

/** The earliest day that needs no reason: staff cannot go further back, admin needs a backdate reason. */
export function earliestReceivedOn(today: string): string {
  return addDays(today, -STAFF_BACKDATE_DAYS);
}

/**
 * The day the money was received, "YYYY-MM-DD" (India), checked against `today`.
 * Never in the future. Staff: today or up to 2 days back. Admin: any past day, but older than
 * 2 days needs a backdate reason (and a note for "other"); a reason sent for a newer day is ignored.
 */
export function checkReceivedOn(
  role: string | null | undefined,
  input: unknown,
  today: string,
  reason?: { code?: unknown; note?: unknown } | null,
): { ok: true; receivedOn: string; backdate: Backdate | null } | { ok: false; error: string } {
  const date = checkEntryDate(input, today);
  if (!date.ok) return date;
  const days = daysBetween(date.date, today);
  if (days <= STAFF_BACKDATE_DAYS) return { ok: true, receivedOn: date.date, backdate: null };
  if (!isAdmin(role)) return { ok: false, error: RECEIVED_ON_RANGE };
  const why = checkReasonCode("backdate", reason?.code, reason?.note);
  if (!why.ok) return { ok: false, error: isReasonCode("backdate", reason?.code) ? why.error : PICK_BACKDATE_REASON };
  return { ok: true, receivedOn: date.date, backdate: { code: why.code, note: why.note } };
}

/**
 * The moment the ledger, aging and statement use for a payment credit. A payment received on an
 * earlier day than it was saved counts at the last millisecond of that day (India), so it sorts on
 * its received day; otherwise it counts when it was saved. Mirrors `ledgerMomentSql` in lib/ledger.ts.
 */
export function paymentMoment(receivedOn: string, createdAt: Date): Date {
  if (receivedOn < toISTDateKey(createdAt)) return new Date(istStartOf(addDays(receivedOn, 1)).getTime() - 1);
  return createdAt;
}

/* ---------- Recording ---------- */

export type ReceiptRequest = {
  retailerId: string;
  mode: string;
  totalPaise: number;
  utr?: string | null;
  note?: string | null;
  /** Who records it (decides how far back the date may go). */
  role: string | null | undefined;
  /** Today in India, "YYYY-MM-DD". */
  today: string;
  receivedOn: unknown;
  onlineMethod?: unknown;
  bankAccountId?: unknown;
  payerName?: unknown;
  backdateReasonCode?: unknown;
  backdateNote?: unknown;
};

export type ReceiptPlan =
  | {
      ok: true;
      status: "received" | "unverified";
      /** UTR to store (online), else null. */
      utr: string | null;
      note: string;
      /** Online only (null / "" for cash). */
      onlineMethod: OnlineMethod | null;
      bankAccountId: string | null;
      payerName: string;
      receivedOn: string;
      /** Set when an admin picked a day more than 2 days back. */
      backdate: Backdate | null;
      /** Ledger credit to post now (cash), or null (online waits for "Verified"). */
      ledger: LedgerEntry | null;
      /** Cash now held by the person who recorded it (0 for online). */
      walletPaise: number;
    }
  | { ok: false; error: string };

/** Turns a payment request into what must be saved, or an error. */
export function planReceipt(req: ReceiptRequest): ReceiptPlan {
  const modeError = validateModeDetails(req.mode, { utr: req.utr });
  if (modeError) return { ok: false, error: modeError };
  const amountError = checkReceiptAmount(req.totalPaise);
  if (amountError) return { ok: false, error: amountError };
  if (req.mode === "online") {
    const onlineError = checkOnlineDetails(req);
    if (onlineError) return { ok: false, error: onlineError };
  }
  const note = typeof req.note === "string" ? req.note.trim() : "";
  if (note.length > MAX_REASON) return { ok: false, error: `Keep the note under ${MAX_REASON} characters.` };
  const date = checkReceivedOn(req.role, req.receivedOn, req.today, { code: req.backdateReasonCode, note: req.backdateNote });
  if (!date.ok) return date;
  const when = { receivedOn: date.receivedOn, backdate: date.backdate };
  if (req.mode === "online") {
    return {
      ok: true,
      status: "unverified",
      utr: normaliseUtr(req.utr),
      note,
      onlineMethod: req.onlineMethod as OnlineMethod,
      bankAccountId: req.bankAccountId as string,
      payerName: cleanPayerName(req.payerName),
      ...when,
      ledger: null,
      walletPaise: 0,
    };
  }
  return {
    ok: true,
    status: "received",
    utr: null,
    note,
    onlineMethod: null,
    bankAccountId: null,
    payerName: "",
    ...when,
    ledger: { retailerId: req.retailerId, kind: "receipt_credit", amountPaise: -req.totalPaise },
    walletPaise: req.totalPaise,
  };
}

/* ---------- Online: verify or reject (accounts / admin) ---------- */

export function canVerifyPayments(role: string | null | undefined): boolean {
  return hasAnyRole(role, ["accounts"]);
}

function checkUnverifiedOnline(role: string | null | undefined, receipt: { mode: string; status: string }): Result {
  if (!canVerifyPayments(role)) return { ok: false, error: "Only accounts or admin can verify online payments." };
  if (receipt.mode !== "online") return { ok: false, error: "Only online payments are verified." };
  if (receipt.status !== "unverified") return { ok: false, error: "This payment was already checked." };
  return { ok: true };
}

/** "Verified": status verified, and the ledger credit (minus the amount) is posted now. */
export function planVerify(
  role: string | null | undefined,
  receipt: { mode: string; status: string; retailerId: string; totalPaise: number },
): { ok: true; ledger: LedgerEntry } | { ok: false; error: string } {
  const check = checkUnverifiedOnline(role, receipt);
  if (!check.ok) return check;
  return { ok: true, ledger: { retailerId: receipt.retailerId, kind: "receipt_credit", amountPaise: -receipt.totalPaise } };
}

/** "Reject" (the money never arrived): status rejected, a reason code required (note optional), nothing posted. */
export function planReject(
  role: string | null | undefined,
  receipt: { mode: string; status: string },
  reasonCode: unknown,
  note: unknown,
): { ok: true; code: PaymentReasonCode; note: string } | { ok: false; error: string } {
  const check = checkUnverifiedOnline(role, receipt);
  if (!check.ok) return check;
  return checkReasonCode("payment", reasonCode, note);
}
