/**
 * Cash, online and staff activity reports as plain functions (no database).
 * Source: docs/idea.md sections 6 and 9 ("Cash held by each staff member; online payments waiting
 * for verification"; "Staff activity: orders placed, approvals, dispatches, payments recorded per person").
 *
 * Choices where the spec is silent:
 * - Cash held = collected − reversed − confirmed handovers (walletBalance); a handover still
 *   waiting for accounts is shown as "waiting" and still counts as held.
 * - Payments in a range = payments RECORDED in the range that still stand: cash received,
 *   online verified, online waiting. Rejected and reversed ones are shown on their own lines and
 *   are not in the total.
 * - Online waiting "age" = whole days in India since the oldest one was recorded.
 * - Staff activity counts what each person did in the range: orders they placed, orders they
 *   approved / rejected, dispatches (loads and bags) and payments they recorded that still stand.
 */
import { toISTDateKey } from "./datetime";
import { daysBetween } from "./report-range";
import { walletBalance, type WalletMovement } from "./wallet-rules";

export type Names = ReadonlyMap<string, string>;

export type CashHolder = { personId: string; name: string; heldPaise: number; waitingPaise: number };

/** Cash held now by each staff member, biggest first. People holding nothing are left out. */
export function cashByPerson(rows: readonly (WalletMovement & { collectorId: string })[], names: Names): CashHolder[] {
  const by = new Map<string, WalletMovement[]>();
  for (const r of rows) {
    const list = by.get(r.collectorId) ?? [];
    list.push(r);
    by.set(r.collectorId, list);
  }
  const out: CashHolder[] = [];
  for (const [personId, moves] of by) {
    const b = walletBalance(moves);
    if (b.balancePaise === 0 && b.pendingPaise === 0) continue;
    out.push({ personId, name: names.get(personId) ?? "Someone", heldPaise: b.balancePaise, waitingPaise: b.pendingPaise });
  }
  return out.sort((a, b) => b.heldPaise - a.heldPaise || a.name.localeCompare(b.name));
}

export type PaymentRow = { mode: string; status: string; totalPaise: number; createdAt: Date | string; receivedBy: string };

/** Online payments waiting for accounts: how many, how much, and the oldest one's age in days. */
export function onlineWaiting(rows: readonly PaymentRow[], now: Date): { count: number; amountPaise: number; oldestDays: number | null } {
  const waiting = rows.filter((r) => r.mode === "online" && r.status === "unverified");
  if (waiting.length === 0) return { count: 0, amountPaise: 0, oldestDays: null };
  const oldest = waiting.reduce((min, r) => Math.min(min, new Date(r.createdAt).getTime()), Infinity);
  return {
    count: waiting.length,
    amountPaise: waiting.reduce((n, r) => n + r.totalPaise, 0),
    oldestDays: daysBetween(toISTDateKey(oldest), toISTDateKey(now)),
  };
}

export type CountAmount = { count: number; paise: number };

export type PaymentsByMode = {
  cash: CountAmount;
  onlineVerified: CountAmount;
  onlineWaiting: CountAmount;
  /** cash + online verified + online waiting. */
  total: CountAmount;
  /** Not in the total. */
  reversed: CountAmount;
  rejected: CountAmount;
};

/** Payments recorded in a range (pass only those rows), by mode and state. */
export function paymentsByMode(rows: readonly PaymentRow[]): PaymentsByMode {
  const zero = (): CountAmount => ({ count: 0, paise: 0 });
  const out: PaymentsByMode = { cash: zero(), onlineVerified: zero(), onlineWaiting: zero(), total: zero(), reversed: zero(), rejected: zero() };
  const add = (c: CountAmount, p: number) => {
    c.count += 1;
    c.paise += p;
  };
  for (const r of rows) {
    if (r.status === "reversed") add(out.reversed, r.totalPaise);
    else if (r.status === "rejected") add(out.rejected, r.totalPaise);
    else if (r.mode === "cash" && r.status === "received") add(out.cash, r.totalPaise);
    else if (r.mode === "online" && r.status === "verified") add(out.onlineVerified, r.totalPaise);
    else if (r.mode === "online" && r.status === "unverified") add(out.onlineWaiting, r.totalPaise);
    else continue;
    if (r.status !== "reversed" && r.status !== "rejected") add(out.total, r.totalPaise);
  }
  return out;
}

/** True for a payment that still stands (counted in totals). */
export function paymentStands(status: string): boolean {
  return status !== "rejected" && status !== "reversed";
}

export type StaffLine = {
  personId: string;
  name: string;
  ordersPlaced: number;
  approved: number;
  rejected: number;
  dispatches: number;
  dispatchedBags: number;
  payments: number;
  paymentsPaise: number;
  cashHeldPaise: number;
};

/** What each person did in the range (pass only rows in the range), plus cash held now. By name. */
export function staffActivity(
  input: {
    orders: readonly { placedBy: string }[];
    decisions: readonly { actorId: string; toStatus: string }[];
    dispatches: readonly { dispatchedBy: string; bags: number }[];
    payments: readonly Pick<PaymentRow, "receivedBy" | "status" | "totalPaise">[];
    cash: readonly CashHolder[];
  },
  names: Names,
): StaffLine[] {
  const lines = new Map<string, StaffLine>();
  const line = (id: string) => {
    let l = lines.get(id);
    if (!l) {
      l = {
        personId: id,
        name: names.get(id) ?? "Someone",
        ordersPlaced: 0,
        approved: 0,
        rejected: 0,
        dispatches: 0,
        dispatchedBags: 0,
        payments: 0,
        paymentsPaise: 0,
        cashHeldPaise: 0,
      };
      lines.set(id, l);
    }
    return l;
  };
  for (const o of input.orders) line(o.placedBy).ordersPlaced += 1;
  for (const d of input.decisions) {
    if (d.toStatus === "approved") line(d.actorId).approved += 1;
    else if (d.toStatus === "rejected") line(d.actorId).rejected += 1;
  }
  for (const d of input.dispatches) {
    const l = line(d.dispatchedBy);
    l.dispatches += 1;
    l.dispatchedBags += d.bags;
  }
  for (const p of input.payments) {
    if (!paymentStands(p.status)) continue;
    const l = line(p.receivedBy);
    l.payments += 1;
    l.paymentsPaise += p.totalPaise;
  }
  for (const c of input.cash) line(c.personId).cashHeldPaise = c.heldPaise;
  return [...lines.values()].sort((a, b) => a.name.localeCompare(b.name));
}
