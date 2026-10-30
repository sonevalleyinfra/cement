import { formatINR } from "./money";
import { isStaff } from "./permissions";

const KIND_LABELS: Record<string, string> = {
  opening: "Opening balance",
  order_debit: "Dispatch",
  receipt_credit: "Payment",
  adjustment: "Adjustment",
  receipt_reversal: "Payment reversed",
  dispatch_reversal: "Bags returned",
};

/** Rows about the shop's own payments (a payment, or a payment put back): a shop sees their amounts. */
const PAYMENT_KINDS: readonly string[] = ["receipt_credit", "receipt_reversal"];

/**
 * The word shown for one ledger row. A payment is a credit (negative). A positive
 * `receipt_credit` row puts a payment back on the bill (the payment was reversed),
 * so it reads "Payment reversed", not "Payment". Reversals are now their own kind,
 * "receipt_reversal"; the older + receipt_credit rows stay in the books and read the same.
 */
export function ledgerEntryLabel(kind: string, amountPaise: number): string {
  if (kind === "receipt_credit" && amountPaise > 0) return "Payment reversed";
  return KIND_LABELS[kind] ?? kind;
}

/**
 * The balance line of a retailer in the ledger list: what they owe ("Dues"), or what they paid
 * ahead ("Advance", a minus balance shown as a plus amount). Never "Dues ₹0" for an advance.
 */
export function balanceLine(balancePaise: number): { label: "Dues" | "Advance"; amountPaise: number } {
  return balancePaise < 0 ? { label: "Advance", amountPaise: -balancePaise } : { label: "Dues", amountPaise: balancePaise };
}

export type LedgerSourceRow = {
  id: string;
  kind: string;
  amountPaise: number;
  /** Balance after this row (from withRunningBalance). */
  balancePaise: number;
  note: string;
  actorId: string;
  /** The ledger moment (a payment counts on the day it was received, see ledgerMomentSql). */
  createdAt: Date;
  /** A payment received on an earlier day than it was typed in: show its date only (no time). */
  backdated?: boolean;
  /** Dispatch rows: the product and bags sent (null when unknown); a dispatch_reversal row: minus the bags returned. */
  product: string | null;
  bags: number | null;
  ratePaise?: number | null;
};

export type LedgerViewRow = {
  id: string;
  label: string;
  createdAt: Date;
  /** Show the date only (the time is not the moment it happened). */
  backdated: boolean;
  /** Signed amount, or null when this viewer must not see it. */
  amountPaise: number | null;
  /** Balance after the row, or null when this viewer must not see it. */
  balancePaise: number | null;
  /** "Prism Trade OPC 53 · 40 bags" for a dispatch row. */
  what: string;
  /** Staff note and who posted it (staff only). */
  note: string | null;
  actorId: string | null;
};

/**
 * The rows of one retailer's ledger as this viewer may see them (owner's rule).
 * Staff see everything. Anyone else (the shop's own login) sees every row's kind, date and, for a
 * dispatch (or bags returned), the product and bags, but amounts only on payment rows (their own money): no dispatch,
 * opening or adjustment amount and no running balance, since bags with an amount (or the difference
 * of two balances) would give the rate away. Their total dues show at the top of the page.
 */
export function ledgerRowsForViewer(role: string | null | undefined, rows: readonly LedgerSourceRow[]): LedgerViewRow[] {
  const staff = isStaff(role);
  return rows.map((r) => ({
    id: r.id,
    label: ledgerEntryLabel(r.kind, r.amountPaise),
    createdAt: r.createdAt,
    backdated: r.backdated === true,
    amountPaise: staff || PAYMENT_KINDS.includes(r.kind) ? r.amountPaise : null,
    balancePaise: staff ? r.balancePaise : null,
    what:
      r.kind === "order_debit" || r.kind === "dispatch_reversal"
        ? [
            r.product,
            r.bags !== null
              ? `${Math.abs(r.bags)} bags${
                  staff && (r.ratePaise || (r.bags !== 0 && r.amountPaise))
                    ? ` @ ${formatINR(r.ratePaise ?? Math.abs(Math.round(r.amountPaise / r.bags)))}/bag`
                    : ""
                }`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : "",
    note: staff && r.note ? r.note : null,
    actorId: staff ? r.actorId : null,
  }));
}
