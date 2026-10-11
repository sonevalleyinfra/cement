import { describe, expect, it } from "vitest";
import { reportRange } from "./report-range";
import { buildStatement, byDay, byMoment } from "./statement-rules";

type Row = { amountPaise: number; at: string };
const range = reportRange({ from: "2026-10-02", to: "2026-10-05" });
const at = byMoment(range);
const pos = (r: Row) => at(r.at);

describe("buildStatement", () => {
  it("no data: everything zero and it reconciles", () => {
    const s = buildStatement<Row>([], pos);
    expect(s).toEqual({ openingPaise: 0, entries: [], debitsPaise: 0, creditsPaise: 0, closingPaise: 0, reconciles: true });
  });

  it("opening + entries = closing, with running balances", () => {
    const rows: Row[] = [
      { amountPaise: 10_000, at: "2026-09-20T10:00:00Z" },
      { amountPaise: -4_000, at: "2026-10-01T18:29:59Z" }, // 23:59:59 IST on 1 Oct: before
      { amountPaise: 2_500, at: "2026-10-01T18:30:00Z" }, // 00:00 IST on 2 Oct: in
      { amountPaise: -1_000, at: "2026-10-04T12:00:00Z" },
      { amountPaise: 9_999, at: "2026-10-05T18:30:00Z" }, // 00:00 IST on 6 Oct: after
    ];
    const s = buildStatement(rows, pos);
    expect(s.openingPaise).toBe(6_000);
    expect(s.entries.map((e) => [e.amountPaise, e.balancePaise])).toEqual([
      [2_500, 8_500],
      [-1_000, 7_500],
    ]);
    expect([s.debitsPaise, s.creditsPaise, s.closingPaise]).toEqual([2_500, -1_000, 7_500]);
    expect(s.openingPaise + s.debitsPaise + s.creditsPaise).toBe(s.closingPaise);
    expect(s.reconciles).toBe(true);
  });

  it("an advance (negative balance) carries through", () => {
    const s = buildStatement(
      [
        { amountPaise: -50_000, at: "2026-09-01T00:00:00Z" },
        { amountPaise: 20_000, at: "2026-10-03T00:00:00Z" },
      ],
      pos,
    );
    expect([s.openingPaise, s.closingPaise]).toEqual([-50_000, -30_000]);
  });

  it("refuses fractional paise", () => {
    expect(() => buildStatement([{ amountPaise: 1.5, at: "2026-10-03T00:00:00Z" }], pos)).toThrow();
  });

  it("reconciles on random data (seeded)", () => {
    let seed = 3;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let n = 0; n < 300; n++) {
      const rows: Row[] = Array.from({ length: Math.floor(rand() * 20) }, () => ({
        amountPaise: Math.floor(rand() * 2_000_000) - 1_000_000 || 1,
        at: new Date(Date.UTC(2026, 8, 25) + Math.floor(rand() * 20 * 86_400_000)).toISOString(),
      })).sort((a, b) => a.at.localeCompare(b.at));
      const s = buildStatement(rows, pos);
      expect(s.reconciles).toBe(true);
      const all = rows.filter((r) => pos(r) !== "after").reduce((t, r) => t + r.amountPaise, 0);
      expect(s.closingPaise).toBe(all);
    }
  });
});

describe("byDay", () => {
  it("compares calendar days, both ends included", () => {
    const p = byDay({ from: "2026-10-02", to: "2026-10-05" });
    expect(["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06"].map(p)).toEqual(["before", "in", "in", "after"]);
  });
});
