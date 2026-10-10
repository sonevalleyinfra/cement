import { describe, expect, it } from "vitest";
import {
  addBuckets,
  agingBuckets,
  bucketFor,
  bucketsTotal,
  duesAging,
  duesFromLedger,
  emptyBuckets,
  oldestDue,
  type LedgerRow,
} from "./due-items";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n, 6));
const row = (kind: string, amountPaise: number, orderId: string | null, d: number): LedgerRow => ({
  kind,
  amountPaise,
  orderId,
  createdAt: day(d),
});
const order = (orderId: string, amount: number, d: number) => row("order_debit", amount, orderId, d);
const pay = (amount: number, d: number) => row("receipt_credit", -amount, null, d);
const opening = (amount: number, d: number) => row("opening", amount, null, d);

const one = (rows: LedgerRow[]) => duesFromLedger(rows);

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

describe("duesFromLedger", () => {
  it("no entries, nothing due", () => expect(duesFromLedger([])).toEqual({ balancePaise: 0, duePaise: 0, items: [] }));

  it("orders are items oldest first, payments clear the oldest", () => {
    const f = one([order("o1", 1000, 1), order("o2", 500, 2), pay(1200, 3)]);
    expect(f.duePaise).toBe(300);
    expect(f.items).toEqual([{ kind: "order", orderId: "o2", dueSince: day(2), duePaise: 300 }]);
  });

  it("an advance paid before an order pays that order", () => {
    const f = one([pay(800, 1), order("o1", 1000, 2)]);
    expect(f.items).toEqual([{ kind: "order", orderId: "o1", dueSince: day(2), duePaise: 200 }]);
  });

  it("advance larger than all orders: nothing due, balance negative", () => {
    const f = one([pay(5000, 1), order("o1", 1000, 2)]);
    expect(f).toMatchObject({ balancePaise: -4000, duePaise: 0, items: [] });
  });

  it("a positive opening is always the oldest item, even if posted later", () => {
    const f = one([order("o1", 1000, 1), opening(700, 5), pay(500, 6)]);
    expect(f.items.map((i) => [i.kind, i.duePaise])).toEqual([
      ["opening", 200],
      ["order", 1000],
    ]);
    expect(oldestDue(f)).toEqual(day(5));
  });

  it("a negative opening is a credit", () => {
    const f = one([opening(-300, 0), order("o1", 1000, 1)]);
    expect(f.items).toEqual([{ kind: "order", orderId: "o1", dueSince: day(1), duePaise: 700 }]);
  });

  it("a cancelled order nets to zero, so money paid on it stays as credit for later orders", () => {
    const f = one([
      order("o1", 1000, 1),
      pay(1000, 2),
      row("adjustment", -1000, "o1", 3), // cancel
      order("o2", 600, 4),
    ]);
    expect(f.balancePaise).toBe(-400);
    expect(f.duePaise).toBe(0);
  });

  it("an order with a negative net adds to the credits", () => {
    const f = one([order("o1", 100, 1), row("adjustment", -300, "o1", 2), order("o2", 500, 3)]);
    expect(f.items).toEqual([{ kind: "order", orderId: "o2", dueSince: day(3), duePaise: 300 }]);
  });

  it("rate changes are part of the order's net, dated by its first entry", () => {
    const f = one([order("o1", 1000, 2), row("adjustment", 200, "o1", 5), order("o2", 100, 3)]);
    expect(f.items.map((i) => [i.orderId, i.duePaise, i.dueSince])).toEqual([
      ["o1", 1200, day(2)],
      ["o2", 100, day(3)],
    ]);
  });

  it("a reversed payment brings the dues back", () => {
    const f = one([order("o1", 1000, 1), pay(1000, 2), row("receipt_credit", 1000, null, 3)]);
    expect(f.items).toEqual([{ kind: "order", orderId: "o1", dueSince: day(1), duePaise: 1000 }]);
  });

  it("a debit with no order (manual adjustment) becomes an 'other' item", () => {
    const f = one([row("adjustment", 250, null, 4), order("o1", 100, 1)]);
    expect(f.duePaise).toBe(350);
    expect(f.items.map((i) => [i.kind, i.duePaise])).toEqual([
      ["order", 100],
      ["other", 250],
    ]);
  });

  it("same-moment entries keep the order given", () => {
    const f = one([order("x", 100, 1), order("y", 100, 1)]);
    expect(f.items.map((i) => i.orderId)).toEqual(["x", "y"]);
  });

  it("refuses fractional paise", () => {
    expect(() => duesFromLedger([order("o1", 10.5, 1)])).toThrow();
  });

  it("promise: due === max(0, balance) and items are whole and positive (seeded random)", () => {
    const rand = rng(7);
    const kinds = ["order", "pay", "adjust", "reverse", "cancel", "rate", "opening", "advance"] as const;
    for (let n = 0; n < 2000; n++) {
      const rows: LedgerRow[] = [];
      const orderIds: string[] = [];
      let hasOpening = false;
      const count = Math.floor(rand() * 15);
      for (let i = 0; i < count; i++) {
        const d = Math.floor(rand() * 30);
        const amount = 1 + Math.floor(rand() * 1_000_000);
        const k = kinds[Math.floor(rand() * kinds.length)];
        if (k === "order") {
          const id = `o${i}`;
          orderIds.push(id);
          rows.push(order(id, amount, d));
        } else if (k === "pay" || k === "advance") rows.push(pay(amount, d));
        else if (k === "reverse") rows.push(row("receipt_credit", amount, null, d));
        else if (k === "adjust") rows.push(row("adjustment", d % 2 ? amount : -amount, null, d));
        else if (k === "opening" && !hasOpening) {
          hasOpening = true;
          rows.push(opening(rand() < 0.5 ? amount : -amount, d));
        } else if ((k === "cancel" || k === "rate") && orderIds.length > 0) {
          const id = orderIds[Math.floor(rand() * orderIds.length)];
          const net = rows.filter((r) => r.orderId === id).reduce((s, r) => s + r.amountPaise, 0);
          const adj = k === "cancel" ? -net : rand() < 0.5 ? amount : -Math.floor(amount / 3);
          if (adj !== 0) rows.push(row("adjustment", adj, id, d));
        }
      }
      // Sort by date the way the database returns them.
      rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const f = duesFromLedger(rows);
      const balance = rows.reduce((s, r) => s + r.amountPaise, 0);
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
  });
});

describe("each dispatch is its own item", () => {
  it("two loads of one order age from their own days", () => {
    const f = one([order("o1", 1000, 1), order("o1", 500, 40), pay(1200, 41)]);
    expect(f.items).toEqual([{ kind: "order", orderId: "o1", dueSince: day(40), duePaise: 300 }]);
  });

  it("a minus row on an order clears that order's loads oldest first", () => {
    const f = one([order("o1", 1000, 1), order("o1", 500, 5), row("adjustment", -1200, "o1", 6)]);
    expect(f.items).toEqual([{ kind: "order", orderId: "o1", dueSince: day(5), duePaise: 300 }]);
  });
});

describe("aging buckets", () => {
  // day(n) is 1 Jan 2026 + n at 11:30 IST.
  const asOf = (n: number) => new Date(day(n)).toISOString().slice(0, 10);

  it("bucketFor edges", () => {
    expect([0, 30, 31, 60, 61, 90, 91, 400, -2].map(bucketFor)).toEqual([
      "d0_30",
      "d0_30",
      "d31_60",
      "d31_60",
      "d61_90",
      "d61_90",
      "d90plus",
      "d90plus",
      "d0_30",
    ]);
  });

  it("no data: all zero", () => {
    expect(agingBuckets(one([]), "2026-03-01")).toEqual(emptyBuckets());
  });

  it("a partial payment clears the oldest bucket first", () => {
    const f = one([order("a", 1000, 0), order("b", 2000, 50), order("c", 3000, 95), pay(1500, 96)]);
    // as of day 100: a is 100 days old (90+), b 50 (31-60), c 5 (0-30). The payment clears a and half of b.
    const b = agingBuckets(f, asOf(100));
    expect(b).toEqual({ d0_30: 3000, d31_60: 1500, d61_90: 0, d90plus: 0 });
    expect(bucketsTotal(b)).toBe(f.duePaise);
  });

  it("an advance shows no dues and no buckets", () => {
    const f = one([pay(5000, 0), order("a", 1000, 1)]);
    expect(f.balancePaise).toBe(-4000);
    expect(bucketsTotal(agingBuckets(f, asOf(200)))).toBe(0);
  });

  it("the opening balance is the oldest due", () => {
    const f = one([opening(700, 15), order("a", 1000, 80)]);
    expect(agingBuckets(f, asOf(100))).toEqual({ d0_30: 1000, d31_60: 0, d61_90: 700, d90plus: 0 });
  });

  it("ages by the day in India: 23:59 IST and 00:01 IST next day differ by one day", () => {
    const late = duesFromLedger([{ kind: "order_debit", amountPaise: 100, orderId: "x", createdAt: "2026-01-31T18:29:00Z" }]);
    const early = duesFromLedger([{ kind: "order_debit", amountPaise: 100, orderId: "y", createdAt: "2026-01-31T18:31:00Z" }]);
    // The first is posted on 31 Jan (India), the second on 1 Feb. As of 3 Mar they are 31 and 30 days old.
    expect(agingBuckets(late, "2026-03-03")).toMatchObject({ d31_60: 100 });
    expect(agingBuckets(early, "2026-03-03")).toMatchObject({ d0_30: 100 });
  });

  it("addBuckets adds", () => {
    const a = { d0_30: 1, d31_60: 2, d61_90: 3, d90plus: 4 };
    expect(addBuckets(a, a)).toEqual({ d0_30: 2, d31_60: 4, d61_90: 6, d90plus: 8 });
  });

  it("promise: buckets always add up to what is due (seeded random)", () => {
    const rand = rng(11);
    for (let n = 0; n < 500; n++) {
      const rows: LedgerRow[] = [];
      for (let i = 0; i < 12; i++) {
        const d = Math.floor(rand() * 200);
        const amount = 1 + Math.floor(rand() * 100_000);
        const r = rand();
        if (r < 0.5) rows.push(order(`o${i % 4}`, amount, d));
        else if (r < 0.85) rows.push(pay(amount, d));
        else rows.push(row("adjustment", rand() < 0.5 ? amount : -amount, null, d));
      }
      rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const f = duesFromLedger(rows);
      expect(bucketsTotal(agingBuckets(f, asOf(220)))).toBe(f.duePaise);
    }
  });
});

describe("duesAging (all retailers)", () => {
  const asOf = new Date(day(100)).toISOString().slice(0, 10);
  const at = (retailerId: string, r: LedgerRow) => ({ ...r, retailerId });
  const names = new Map([
    ["r1", "Sharma"],
    ["r2", "Gupta"],
    ["r3", "Singh"],
  ]);

  it("no data", () => {
    expect(duesAging([], names, asOf)).toEqual({
      lines: [],
      total: { duePaise: 0, buckets: emptyBuckets() },
      advances: [],
      advancesPaise: 0,
    });
  });

  it("biggest dues first, advances apart, totals add up", () => {
    const rows = [
      at("r1", order("a", 1000, 0)),
      at("r2", order("b", 5000, 80)),
      at("r2", pay(1000, 90)),
      at("r3", pay(2500, 10)),
      at("r3", order("c", 500, 20)),
    ];
    const d = duesAging(rows, names, asOf);
    expect(d.lines.map((l) => [l.name, l.duePaise])).toEqual([
      ["Gupta", 4000],
      ["Sharma", 1000],
    ]);
    expect(d.lines[0].buckets).toEqual({ d0_30: 4000, d31_60: 0, d61_90: 0, d90plus: 0 });
    expect(d.lines[1].buckets).toEqual({ d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 1000 });
    expect(d.total.duePaise).toBe(5000);
    expect(bucketsTotal(d.total.buckets)).toBe(5000);
    expect(d.advances).toEqual([{ retailerId: "r3", name: "Singh", advancePaise: 2000 }]);
    // Total dues = sum of positive balances (the advance does not reduce it).
    const balances = new Map<string, number>();
    for (const r of rows) balances.set(r.retailerId, (balances.get(r.retailerId) ?? 0) + r.amountPaise);
    expect(d.total.duePaise).toBe([...balances.values()].reduce((n, b) => n + Math.max(0, b), 0));
  });
});
