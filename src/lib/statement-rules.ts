/**
 * Account statements (a retailer's ledger, the Prism account) as plain functions (no database).
 * Source: docs/idea.md section 9 ("a retailer statement", "Prism account statement").
 *
 * A statement for a date range = the opening balance (every entry before the range), every entry
 * in the range with the balance after it, and the closing balance.
 * It must reconcile: opening + entries in the range = closing, and closing = the sum of every
 * entry up to the end of the range, counted separately. `reconciles` is false if not (shown on screen).
 */
import type { ReportRange } from "./report-range";

export type Position = "before" | "in" | "after";

export type Statement<T> = {
  openingPaise: number;
  entries: (T & { balancePaise: number })[];
  /** Sum of the plus entries in the range (owed more). */
  debitsPaise: number;
  /** Sum of the minus entries in the range, as a minus number (owed less). */
  creditsPaise: number;
  closingPaise: number;
  /** True when opening + entries = closing = sum of everything up to the end of the range. */
  reconciles: boolean;
};

/** Builds the statement. `rows` must be oldest first; `position` says where each row falls. */
export function buildStatement<T extends { amountPaise: number }>(
  rows: readonly T[],
  position: (row: T) => Position,
): Statement<T> {
  let opening = 0;
  let upToEnd = 0;
  let debits = 0;
  let credits = 0;
  const inside: T[] = [];
  for (const r of rows) {
    if (!Number.isSafeInteger(r.amountPaise)) throw new RangeError("Amounts must be whole paise");
    const where = position(r);
    if (where === "after") continue;
    upToEnd += r.amountPaise;
    if (where === "before") opening += r.amountPaise;
    else {
      inside.push(r);
      if (r.amountPaise > 0) debits += r.amountPaise;
      else credits += r.amountPaise;
    }
  }
  let running = opening;
  const entries = inside.map((r) => {
    running += r.amountPaise;
    return { ...r, balancePaise: running };
  });
  const closing = opening + debits + credits;
  return {
    openingPaise: opening,
    entries,
    debitsPaise: debits,
    creditsPaise: credits,
    closingPaise: closing,
    reconciles: closing === upToEnd && running === closing,
  };
}

/** Where a row with an exact moment falls (retailer ledger: `createdAt`). */
export function byMoment(range: Pick<ReportRange, "start" | "end">) {
  return (at: Date | string): Position => {
    const t = new Date(at).getTime();
    if (t < range.start.getTime()) return "before";
    return t < range.end.getTime() ? "in" : "after";
  };
}

/** Where a row with a calendar day falls (Prism account: `entryDate`, "YYYY-MM-DD"). */
export function byDay(range: Pick<ReportRange, "from" | "to">) {
  return (day: string): Position => {
    if (day < range.from) return "before";
    return day <= range.to ? "in" : "after";
  };
}
