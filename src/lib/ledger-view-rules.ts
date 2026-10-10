import { isStaff } from "./permissions";

const KIND_LABELS: Record<string, string> = {
  opening: "Opening balance",
  order_debit: "Dispatch",
  receipt_credit: "Payment",
  adjustment: "Adjustment",
};

/**
 * The word shown for one ledger row. A payment is a credit (negative). A positive
 * `receipt_credit` row puts a payment back on the bill (the payment was reversed),
 * so it reads "Payment reversed", not "Payment".
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
  createdAt: Date;
  /** Dispatch rows: the product and bags sent (null when unknown). */
  product: string | null;
  bags: number | null;
};

export type LedgerViewRow = {
  id: string;
  label: string;
  createdAt: Date;
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
 * dispatch, the product and bags, but amounts only on payment rows (their own money): no dispatch,
 * opening or adjustment amount and no running balance, since bags with an amount (or the difference
 * of two balances) would give the rate away. Their total dues show at the top of the page.
 */
export function ledgerRowsForViewer(role: string | null | undefined, rows: readonly LedgerSourceRow[]): LedgerViewRow[] {
  const staff = isStaff(role);
  return rows.map((r) => ({
    id: r.id,
    label: ledgerEntryLabel(r.kind, r.amountPaise),
    createdAt: r.createdAt,
    amountPaise: staff || r.kind === "receipt_credit" ? r.amountPaise : null,
    balancePaise: staff ? r.balancePaise : null,
    what: r.kind === "order_debit" ? [r.product, r.bags !== null ? `${r.bags} bags` : null].filter(Boolean).join(" · ") : "",
    note: staff && r.note ? r.note : null,
    actorId: staff ? r.actorId : null,
  }));
}
