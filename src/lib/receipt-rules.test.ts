import { describe, expect, it } from "vitest";
import {
  autoSplitOldestFirst,
  bounceReversal,
  canChangeChequeStatus,
  clearFull,
  firmLines,
  interFirmBalances,
  validateAllocation,
  validateModeDetails,
  type OutstandingItem,
} from "./receipt-rules";

const item = (orderId: string, firmId: string, dueSinceDate: string, duePaise: number): OutstandingItem => ({
  orderId, firmId, dueSinceDate, duePaise, retailerId: "r1",
});

// Small seeded generator (mulberry32) so the random tests are repeatable.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("validateModeDetails", () => {
  it("cash needs nothing", () => expect(validateModeDetails("cash", {})).toBeNull());
  it("online needs UTR and firm", () => {
    expect(validateModeDetails("online", { receivedFirmId: "a" })).toMatch(/UTR/);
    expect(validateModeDetails("online", { utr: "  ", receivedFirmId: "a" })).toMatch(/UTR/);
    expect(validateModeDetails("online", { utr: "X1" })).toMatch(/firm/);
    expect(validateModeDetails("online", { utr: "X1", receivedFirmId: "a" })).toBeNull();
  });
  it("cheque needs number, date, bank, firm", () => {
    const ok = { chequeNumber: "123", chequeDate: "2026-10-01", bankName: "SBI", receivedFirmId: "a" };
    expect(validateModeDetails("cheque", ok)).toBeNull();
    expect(validateModeDetails("cheque", { ...ok, chequeNumber: "" })).toMatch(/number/);
    expect(validateModeDetails("cheque", { ...ok, chequeDate: "01/10/2026" })).toMatch(/date/);
    expect(validateModeDetails("cheque", { ...ok, bankName: null })).toMatch(/bank name/);
    expect(validateModeDetails("cheque", { ...ok, receivedFirmId: null })).toMatch(/firm/);
  });
  it("rejects unknown mode", () => expect(validateModeDetails("upi", {})).not.toBeNull());
});

describe("autoSplitOldestFirst", () => {
  it("matches the spec example", () => {
    const items = [item("a1", "A", "2026-01-01", 6_000_000), item("b1", "B", "2026-02-01", 7_000_000)];
    const r = autoSplitOldestFirst(10_000_000, items);
    expect(r.allocations).toEqual([
      { orderId: "a1", firmId: "A", amountPaise: 6_000_000 },
      { orderId: "b1", firmId: "B", amountPaise: 4_000_000 },
    ]);
    expect(r.advancePaise).toBe(0);
  });
  it("orders by date across firms, ties keep given order", () => {
    const items = [
      item("x", "B", "2026-03-01", 100),
      item("y", "A", "2026-01-01", 100),
      item("z", "A", "2026-03-01", 100),
    ];
    expect(autoSplitOldestFirst(300, items).allocations.map((a) => a.orderId)).toEqual(["y", "x", "z"]);
  });
  it("exact clear leaves no advance", () => {
    const r = autoSplitOldestFirst(200, [item("a", "A", "2026-01-01", 200)]);
    expect(r.advancePaise).toBe(0);
  });
  it("overpay goes to advance", () => {
    const r = autoSplitOldestFirst(500, [item("a", "A", "2026-01-01", 200)]);
    expect(r.advancePaise).toBe(300);
  });
  it("underpay leaves later dues untouched", () => {
    const r = autoSplitOldestFirst(150, [item("a", "A", "2026-01-01", 100), item("b", "A", "2026-02-01", 100)]);
    expect(r.allocations).toHaveLength(2);
    expect(r.allocations[1].amountPaise).toBe(50);
  });
  it("skips zero dues and handles no items", () => {
    expect(autoSplitOldestFirst(100, [item("a", "A", "2026-01-01", 0)])).toEqual({ allocations: [], advancePaise: 100 });
    expect(autoSplitOldestFirst(0, [item("a", "A", "2026-01-01", 10)]).allocations).toEqual([]);
  });
  it("rejects bad receipt amounts", () => {
    expect(() => autoSplitOldestFirst(-1, [])).toThrow();
    expect(() => autoSplitOldestFirst(1.5, [])).toThrow();
    expect(() => autoSplitOldestFirst(NaN, [])).toThrow();
  });
  it("allocations + advance always equal the receipt (seeded random)", () => {
    const rand = rng(42);
    for (let n = 0; n < 500; n++) {
      const items = Array.from({ length: Math.floor(rand() * 8) }, (_, i) =>
        item(`o${i}`, rand() < 0.5 ? "A" : "B", `2026-0${1 + Math.floor(rand() * 9)}-01`, Math.floor(rand() * 1_000_000)),
      );
      const receipt = Math.floor(rand() * 5_000_000) + 1;
      const r = autoSplitOldestFirst(receipt, items);
      const sum = r.allocations.reduce((s, a) => s + a.amountPaise, 0) + r.advancePaise;
      expect(sum).toBe(receipt);
      expect(r.advancePaise).toBeGreaterThanOrEqual(0);
      for (const a of r.allocations) {
        expect(Number.isInteger(a.amountPaise)).toBe(true);
        expect(a.amountPaise).toBeLessThanOrEqual(items.find((i) => i.orderId === a.orderId)!.duePaise);
      }
      const check = validateAllocation(receipt, r.allocations, items, {
        retailerId: "r1",
        advance: { firmId: "A", amountPaise: r.advancePaise },
      });
      expect(check.ok).toBe(true);
    }
  });
});

describe("clearFull", () => {
  const items = [item("a", "A", "2026-01-01", 100), item("b", "B", "2026-01-02", 250), item("c", "A", "2026-01-03", 5)];
  it("totals all firms", () => expect(clearFull(items).totalPaise).toBe(355));
  it("totals one firm", () => {
    const r = clearFull(items, "A");
    expect(r.totalPaise).toBe(105);
    expect(r.allocations.map((a) => a.orderId)).toEqual(["a", "c"]);
  });
  it("empty is zero", () => expect(clearFull([]).totalPaise).toBe(0));
});

describe("validateAllocation", () => {
  const items = [item("a", "A", "2026-01-01", 100), item("b", "B", "2026-01-02", 200)];
  const A = { orderId: "a", firmId: "A", amountPaise: 100 };
  it("accepts remaining 0", () => {
    const r = validateAllocation(300, [A, { orderId: "b", firmId: "B", amountPaise: 200 }], items, { retailerId: "r1" });
    expect(r).toEqual({ ok: true, remainingPaise: 0, firmTotals: { A: 100, B: 200 } });
  });
  it("rejects underpay left unallocated", () => {
    const r = validateAllocation(300, [A], items);
    expect(r).toMatchObject({ ok: false, remainingPaise: 200 });
  });
  it("overpay needs explicit advance", () => {
    expect(validateAllocation(150, [A], items).ok).toBe(false);
    const r = validateAllocation(150, [A], items, { advance: { firmId: "B", amountPaise: 50 } });
    expect(r).toMatchObject({ ok: true, firmTotals: { A: 100, B: 50 } });
  });
  it("rejects advance without a firm", () => {
    expect(validateAllocation(150, [A], items, { advance: { firmId: "", amountPaise: 50 } }).ok).toBe(false);
  });
  it("rejects more than the receipt", () => {
    expect(validateAllocation(50, [A], items)).toMatchObject({ ok: false, remainingPaise: -50 });
  });
  it("rejects above due, negative, fractional, duplicate, unknown", () => {
    expect(validateAllocation(101, [{ ...A, amountPaise: 101 }], items).ok).toBe(false);
    expect(validateAllocation(100, [{ ...A, amountPaise: -1 }, { ...A, amountPaise: 101 }], items).ok).toBe(false);
    expect(validateAllocation(100, [{ ...A, amountPaise: 50.5 }], items).ok).toBe(false);
    expect(validateAllocation(100, [{ ...A, amountPaise: 50 }, { ...A, amountPaise: 50 }], items).ok).toBe(false);
    expect(validateAllocation(100, [{ orderId: "zzz", firmId: "A", amountPaise: 100 }], items).ok).toBe(false);
  });
  it("rejects wrong firm and other retailer", () => {
    expect(validateAllocation(100, [{ ...A, firmId: "B" }], items).ok).toBe(false);
    expect(validateAllocation(100, [A], items, { retailerId: "r2" }).ok).toBe(false);
  });
  it("rejects zero or invalid receipt", () => {
    expect(validateAllocation(0, [], items).ok).toBe(false);
    expect(validateAllocation(1.5, [], items).ok).toBe(false);
  });
});

describe("firm lines and inter-firm", () => {
  const allocs = [
    { orderId: "a", firmId: "A", amountPaise: 60 },
    { orderId: "b", firmId: "B", amountPaise: 30 },
    { orderId: "c", firmId: "B", amountPaise: 10 },
  ];
  it("one line per firm incl. advance", () => {
    expect(firmLines(allocs, { firmId: "A", amountPaise: 5 })).toEqual([
      { firmId: "A", amountPaise: 65 },
      { firmId: "B", amountPaise: 40 },
    ]);
  });
  it("receiving firm owes the other firms", () => {
    expect(interFirmBalances("A", firmLines(allocs))).toEqual([{ owedByFirmId: "A", owedToFirmId: "B", amountPaise: 40 }]);
  });
  it("none when all lines are the receiving firm", () => {
    expect(interFirmBalances("A", [{ firmId: "A", amountPaise: 9 }])).toEqual([]);
  });
});

describe("cheque lifecycle", () => {
  it("pending can clear or bounce", () => {
    expect(canChangeChequeStatus("pending", "cleared")).toBe(true);
    expect(canChangeChequeStatus("pending", "bounced")).toBe(true);
  });
  it("final states and same-state cannot change", () => {
    expect(canChangeChequeStatus("pending", "pending")).toBe(false);
    for (const from of ["cleared", "bounced"] as const)
      for (const to of ["pending", "cleared", "bounced"] as const) expect(canChangeChequeStatus(from, to)).toBe(false);
  });
  it("bounce reversal cancels the credit fully", () => {
    const lines = firmLines([{ orderId: "a", firmId: "A", amountPaise: 70 }, { orderId: "b", firmId: "B", amountPaise: 30 }]);
    const rev = bounceReversal(lines);
    expect(rev).toEqual([{ firmId: "A", amountPaise: -70 }, { firmId: "B", amountPaise: -30 }]);
    const net = [...lines, ...rev].reduce((s, l) => s + l.amountPaise, 0);
    expect(net).toBe(0);
  });
});
