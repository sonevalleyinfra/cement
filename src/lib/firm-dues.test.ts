import { describe, expect, it } from "vitest";
import { firmDuesFromLedger, oldestDue, type LedgerRow } from "./firm-dues";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n, 6));
const row = (firmId: string, kind: string, amountPaise: number, orderId: string | null, d: number): LedgerRow => ({
  firmId,
  kind,
  amountPaise,
  orderId,
  createdAt: day(d),
});
const order = (firmId: string, orderId: string, amount: number, d: number) => row(firmId, "order_debit", amount, orderId, d);
const pay = (firmId: string, amount: number, d: number) => row(firmId, "receipt_credit", -amount, null, d);
const opening = (firmId: string, amount: number, d: number) => row(firmId, "opening", amount, null, d);

const one = (rows: LedgerRow[], firmId = "A") => firmDuesFromLedger(rows).find((f) => f.firmId === firmId)!;

// Small seeded generator (mulberry32) so the random tests are repeatable.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("firmDuesFromLedger", () => {
  it("no entries, no firms", () => expect(firmDuesFromLedger([])).toEqual([]));

  it("orders are items oldest first, payments clear the oldest", () => {
    const f = one([order("A", "o1", 1000, 1), order("A", "o2", 500, 2), pay("A", 1200, 3)]);
    expect(f.duePaise).toBe(300);
    expect(f.items).toEqual([{ kind: "order", orderId: "o2", dueSince: day(2), duePaise: 300 }]);
  });

  it("an advance paid before an order pays that order", () => {
    const f = one([pay("A", 800, 1), order("A", "o1", 1000, 2)]);
    expect(f.items).toEqual([{ kind: "order", orderId: "o1", dueSince: day(2), duePaise: 200 }]);
  });

  it("advance larger than all orders: nothing due, balance negative", () => {
    const f = one([pay("A", 5000, 1), order("A", "o1", 1000, 2)]);
    expect(f).toMatchObject({ balancePaise: -4000, duePaise: 0, items: [] });
  });

  it("a positive opening is always the oldest item, even if posted later", () => {
    const f = one([order("A", "o1", 1000, 1), opening("A", 700, 5), pay("A", 500, 6)]);
    expect(f.items.map((i) => [i.kind, i.duePaise])).toEqual([
      ["opening", 200],
      ["order", 1000],
    ]);
    expect(oldestDue(f)).toEqual(day(5));
  });

  it("a negative opening is a credit", () => {
    const f = one([opening("A", -300, 0), order("A", "o1", 1000, 1)]);
    expect(f.items).toEqual([{ kind: "order", orderId: "o1", dueSince: day(1), duePaise: 700 }]);
  });

  it("a cancelled order nets to zero, so money paid on it stays as credit for later orders", () => {
    const f = one([
      order("A", "o1", 1000, 1),
      pay("A", 1000, 2),
      row("A", "adjustment", -1000, "o1", 3), // cancel
      order("A", "o2", 600, 4),
    ]);
    expect(f.balancePaise).toBe(-400);
    expect(f.duePaise).toBe(0);
  });

  it("an order with a negative net adds to the credits", () => {
    const f = one([order("A", "o1", 100, 1), row("A", "adjustment", -300, "o1", 2), order("A", "o2", 500, 3)]);
    expect(f.items).toEqual([{ kind: "order", orderId: "o2", dueSince: day(3), duePaise: 300 }]);
  });

  it("rate changes are part of the order's net, dated by its first entry", () => {
    const f = one([order("A", "o1", 1000, 2), row("A", "adjustment", 200, "o1", 5), order("A", "o2", 100, 3)]);
    expect(f.items.map((i) => [i.orderId, i.duePaise, i.dueSince])).toEqual([
      ["o1", 1200, day(2)],
      ["o2", 100, day(3)],
    ]);
  });

  it("a bounced cheque brings the dues back", () => {
    const f = one([order("A", "o1", 1000, 1), pay("A", 1000, 2), row("A", "receipt_credit", 1000, null, 3)]);
    expect(f.items).toEqual([{ kind: "order", orderId: "o1", dueSince: day(1), duePaise: 1000 }]);
  });

  it("a debit with no order (manual adjustment) becomes an 'other' item", () => {
    const f = one([row("A", "adjustment", 250, null, 4), order("A", "o1", 100, 1)]);
    expect(f.duePaise).toBe(350);
    expect(f.items.map((i) => [i.kind, i.duePaise])).toEqual([
      ["order", 100],
      ["other", 250],
    ]);
  });

  it("keeps firms apart: a payment to A never clears B", () => {
    const res = firmDuesFromLedger([order("A", "o1", 1000, 1), order("B", "o2", 400, 1), pay("A", 1500, 2)]);
    expect(res.map((f) => [f.firmId, f.duePaise, f.balancePaise])).toEqual([
      ["A", 0, -500],
      ["B", 400, 400],
    ]);
  });

  it("same-moment entries keep the order given", () => {
    const f = one([order("A", "x", 100, 1), order("A", "y", 100, 1)]);
    expect(f.items.map((i) => i.orderId)).toEqual(["x", "y"]);
  });

  it("refuses fractional paise", () => {
    expect(() => firmDuesFromLedger([order("A", "o1", 10.5, 1)])).toThrow();
  });

  it("promise: firm due === max(0, firm balance) and items are whole and positive (seeded random)", () => {
    const rand = rng(7);
    const kinds = ["order", "pay", "bounce", "reverse", "cancel", "rate", "opening", "advance"] as const;
    for (let n = 0; n < 2000; n++) {
      const rows: LedgerRow[] = [];
      const firms = ["A", "B", "C"];
      const orderIds: string[] = [];
      const hasOpening = new Set<string>();
      const count = Math.floor(rand() * 15);
      for (let i = 0; i < count; i++) {
        const firm = firms[Math.floor(rand() * firms.length)];
        const d = Math.floor(rand() * 30);
        const amount = 1 + Math.floor(rand() * 1_000_000);
        const k = kinds[Math.floor(rand() * kinds.length)];
        if (k === "order") {
          const id = `${firm}-o${i}`;
          orderIds.push(id);
          rows.push(order(firm, id, amount, d));
        } else if (k === "pay" || k === "advance") rows.push(pay(firm, amount, d));
        else if (k === "bounce" || k === "reverse") rows.push(row(firm, "receipt_credit", amount, null, d));
        else if (k === "opening" && !hasOpening.has(firm)) {
          hasOpening.add(firm);
          rows.push(opening(firm, rand() < 0.5 ? amount : -amount, d));
        } else if ((k === "cancel" || k === "rate") && orderIds.length > 0) {
          const id = orderIds[Math.floor(rand() * orderIds.length)];
          const net = rows.filter((r) => r.orderId === id).reduce((s, r) => s + r.amountPaise, 0);
          const adj = k === "cancel" ? -net : rand() < 0.5 ? amount : -Math.floor(amount / 3);
          if (adj !== 0) rows.push(row(id[0], "adjustment", adj, id, d));
        }
      }
      // Shuffle by date the way the database returns them.
      rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const res = firmDuesFromLedger(rows);
      for (const f of res) {
        const balance = rows.filter((r) => r.firmId === f.firmId).reduce((s, r) => s + r.amountPaise, 0);
        expect(f.balancePaise).toBe(balance);
        expect(f.duePaise).toBe(Math.max(0, balance));
        expect(f.items.reduce((s, i) => s + i.duePaise, 0)).toBe(f.duePaise);
        for (const i of f.items) {
          expect(Number.isSafeInteger(i.duePaise)).toBe(true);
          expect(i.duePaise).toBeGreaterThan(0);
        }
        const openings = f.items.filter((i) => i.kind === "opening");
        if (openings.length) expect(f.items[0].kind).toBe("opening");
      }
    }
  });
});
