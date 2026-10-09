import { describe, expect, it } from "vitest";
import { firmDuesFromLedger, type LedgerRow } from "./firm-dues";
import {
  autoSplitByFirm,
  bounceReversal,
  fillAllocation,
  canChangeChequeStatus,
  firmLines,
  interFirmBalances,
  RECEIPT_STATUSES,
  receiptChip,
  validateAllocation,
  validateModeDetails,
  type FirmDue,
} from "./receipt-rules";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n, 6));
const due = (firmId: string, ...items: [number, number, string?][]): FirmDue => ({
  firmId,
  duePaise: items.reduce((s, [, p]) => s + p, 0),
  items: items.map(([d, duePaise, kind]) => ({ kind: kind ?? "order", dueSince: day(d), duePaise })),
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

describe("autoSplitByFirm", () => {
  it("matches the spec example", () => {
    const r = autoSplitByFirm(10_000_000, [due("A", [1, 6_000_000]), due("B", [2, 7_000_000])]);
    expect(r.allocations).toEqual([
      { firmId: "A", amountPaise: 6_000_000 },
      { firmId: "B", amountPaise: 4_000_000 },
    ]);
    expect(r.advancePaise).toBe(0);
  });
  it("walks items oldest first across firms", () => {
    // A: day 1 (100) and day 5 (100); B: day 3 (100). 250 pays A1, B3, then 50 of A5.
    const r = autoSplitByFirm(250, [due("A", [1, 100], [5, 100]), due("B", [3, 100])]);
    expect(r.allocations).toEqual([
      { firmId: "A", amountPaise: 150 },
      { firmId: "B", amountPaise: 100 },
    ]);
  });
  it("openings count as the oldest, whatever their date", () => {
    const r = autoSplitByFirm(100, [due("A", [1, 100]), due("B", [9, 100, "opening"])]);
    expect(r.allocations).toEqual([{ firmId: "B", amountPaise: 100 }]);
  });
  it("ties keep the firm order given", () => {
    const r = autoSplitByFirm(100, [due("B", [1, 100]), due("A", [1, 100])]);
    expect(r.allocations).toEqual([{ firmId: "B", amountPaise: 100 }]);
  });
  it("overpay goes to advance; no dues means all advance", () => {
    expect(autoSplitByFirm(500, [due("A", [1, 200])]).advancePaise).toBe(300);
    expect(autoSplitByFirm(100, [])).toEqual({ allocations: [], advancePaise: 100 });
    expect(autoSplitByFirm(0, [due("A", [1, 10])]).allocations).toEqual([]);
  });
  it("rejects bad receipt amounts", () => {
    expect(() => autoSplitByFirm(-1, [])).toThrow();
    expect(() => autoSplitByFirm(1.5, [])).toThrow();
    expect(() => autoSplitByFirm(NaN, [])).toThrow();
  });
  it("works on real ledger dues and always passes validation (seeded random)", () => {
    const rand = rng(42);
    for (let n = 0; n < 500; n++) {
      const rows: LedgerRow[] = [];
      for (let i = 0; i < Math.floor(rand() * 10); i++) {
        const firmId = ["A", "B", "C"][Math.floor(rand() * 3)];
        const amount = 1 + Math.floor(rand() * 1_000_000);
        const createdAt = day(Math.floor(rand() * 20));
        if (rand() < 0.6) rows.push({ firmId, kind: "order_debit", amountPaise: amount, orderId: `o${i}`, createdAt });
        else rows.push({ firmId, kind: "receipt_credit", amountPaise: -amount, orderId: null, createdAt });
      }
      const dues = firmDuesFromLedger(rows);
      const receipt = Math.floor(rand() * 5_000_000) + 1;
      const r = autoSplitByFirm(receipt, dues);
      const sum = r.allocations.reduce((s, a) => s + a.amountPaise, 0) + r.advancePaise;
      expect(sum).toBe(receipt);
      for (const a of r.allocations) {
        expect(a.amountPaise).toBeGreaterThan(0);
        expect(a.amountPaise).toBeLessThanOrEqual(dues.find((f) => f.firmId === a.firmId)!.duePaise);
      }
      const totalDue = dues.reduce((s, f) => s + f.duePaise, 0);
      expect(r.advancePaise).toBe(Math.max(0, receipt - totalDue));
      const check = validateAllocation(receipt, r.allocations, dues, { firmId: "A", amountPaise: r.advancePaise });
      expect(check.ok).toBe(true);
    }
  });
});

describe("fillAllocation", () => {
  const dues = [due("A", [1, 6_000_000]), due("B", [2, 7_000_000])];
  it("with nothing typed it is the auto-split", () => {
    expect(fillAllocation(10_000_000, dues, {})).toEqual({ amounts: { A: 6_000_000, B: 4_000_000 }, leftoverPaise: 0 });
  });
  it("a typed firm keeps its amount, the others share the rest", () => {
    expect(fillAllocation(10_000_000, dues, { B: 7_000_000 })).toEqual({
      amounts: { A: 3_000_000, B: 7_000_000 },
      leftoverPaise: 0,
    });
  });
  it("leftover is the advance; negative when too much is typed", () => {
    expect(fillAllocation(15_000_000, dues, {}).leftoverPaise).toBe(2_000_000);
    expect(fillAllocation(1_000, dues, { A: 5_000 })).toEqual({ amounts: { A: 5_000, B: 0 }, leftoverPaise: -4_000 });
  });
  it("ignores typed amounts for firms without dues", () => {
    expect(fillAllocation(100, dues, { Z: 100 }).amounts).toEqual({ A: 100, B: 0 });
  });
});

describe("validateAllocation", () => {
  const dues = [due("A", [1, 100]), due("B", [2, 200])];
  it("accepts remaining 0", () => {
    const r = validateAllocation(300, [{ firmId: "A", amountPaise: 100 }, { firmId: "B", amountPaise: 200 }], dues);
    expect(r).toEqual({ ok: true, remainingPaise: 0, firmTotals: { A: 100, B: 200 } });
  });
  it("rejects underpay left unallocated", () => {
    expect(validateAllocation(300, [{ firmId: "A", amountPaise: 100 }], dues)).toMatchObject({ ok: false, remainingPaise: 200 });
  });
  it("overpay needs an explicit advance with a firm", () => {
    const A = { firmId: "A", amountPaise: 100 };
    expect(validateAllocation(150, [A], dues).ok).toBe(false);
    expect(validateAllocation(150, [A], dues, { firmId: "", amountPaise: 50 }).ok).toBe(false);
    expect(validateAllocation(150, [A], dues, { firmId: "A", amountPaise: 50 })).toMatchObject({
      ok: true,
      firmTotals: { A: 150 },
    });
    // Advance may sit with a firm that has no dues.
    expect(validateAllocation(150, [A], dues, { firmId: "C", amountPaise: 50 }).ok).toBe(true);
  });
  it("rejects more than the receipt", () => {
    expect(validateAllocation(50, [{ firmId: "A", amountPaise: 100 }], dues)).toMatchObject({ ok: false, remainingPaise: -50 });
  });
  it("rejects above dues, negative, fractional, twice, firm without dues", () => {
    expect(validateAllocation(101, [{ firmId: "A", amountPaise: 101 }], dues).ok).toBe(false);
    expect(validateAllocation(100, [{ firmId: "A", amountPaise: -1 }], dues).ok).toBe(false);
    expect(validateAllocation(100, [{ firmId: "A", amountPaise: 50.5 }], dues).ok).toBe(false);
    expect(validateAllocation(100, [{ firmId: "A", amountPaise: 50 }, { firmId: "A", amountPaise: 50 }], dues).ok).toBe(false);
    expect(validateAllocation(100, [{ firmId: "Z", amountPaise: 100 }], dues).ok).toBe(false);
    expect(validateAllocation(100, [{ firmId: "A", amountPaise: 100 }], [{ firmId: "A", duePaise: 0, items: [] }]).ok).toBe(false);
  });
  it("ignores zero lines", () => {
    expect(validateAllocation(100, [{ firmId: "A", amountPaise: 100 }, { firmId: "Z", amountPaise: 0 }], dues).ok).toBe(true);
  });
  it("rejects zero or invalid receipt", () => {
    expect(validateAllocation(0, [], dues).ok).toBe(false);
    expect(validateAllocation(1.5, [], dues).ok).toBe(false);
  });
});

describe("firm lines and inter-firm", () => {
  const allocs = [
    { firmId: "A", amountPaise: 60 },
    { firmId: "B", amountPaise: 40 },
  ];
  it("one line per firm incl. advance", () => {
    expect(firmLines(allocs, { firmId: "A", amountPaise: 5 })).toEqual([
      { firmId: "A", amountPaise: 65 },
      { firmId: "B", amountPaise: 40 },
    ]);
  });
  it("sums stored allocation rows (old per-order rows too)", () => {
    expect(firmLines([...allocs, { firmId: "B", amountPaise: 10 }])).toEqual([
      { firmId: "A", amountPaise: 60 },
      { firmId: "B", amountPaise: 50 },
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
    const lines = firmLines([{ firmId: "A", amountPaise: 70 }, { firmId: "B", amountPaise: 30 }]);
    const rev = bounceReversal(lines);
    expect(rev).toEqual([{ firmId: "A", amountPaise: -70 }, { firmId: "B", amountPaise: -30 }]);
    expect([...lines, ...rev].reduce((s, l) => s + l.amountPaise, 0)).toBe(0);
  });
});

describe("receiptChip", () => {
  it("has a label for every status; bounced and reversed are red", () => {
    for (const s of RECEIPT_STATUSES) expect(receiptChip(s).label).not.toBe(s);
    expect(receiptChip("bounced").status).toBe("rejected");
    expect(receiptChip("reversed").status).toBe("rejected");
    expect(receiptChip("unverified").status).toBe("pending");
  });
});
