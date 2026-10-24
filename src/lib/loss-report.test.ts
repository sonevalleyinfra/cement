import { describe, expect, it } from "vitest";
import { lossReport, type LossRow, type LossTotals } from "./loss-report";
import { mulDivRound } from "./money";
import { reportRange } from "./report-range";
import { averageCostPerBag, purchaseCostTotals } from "./sales-report";

const range = reportRange({ from: "2026-10-01", to: "2026-10-05" });
const names = {
  godowns: new Map([
    ["g1", "Main"],
    ["g2", "Annex"],
  ]),
  vehicles: new Map([["v1", "BR01AB1234"]]),
};
const costs = new Map<string, number | null>([
  ["p1", 35_000],
  ["p2", null],
]);
const loss = (bags: number, reasonCode: string | null, over: Partial<LossRow> = {}): LossRow => ({
  productId: "p1",
  godownId: "g1",
  vehicleId: null,
  type: "adjustment",
  bags,
  reasonCode,
  createdAt: "2026-10-02T10:00:00Z",
  ...over,
});
const sum = (lines: LossTotals[]) =>
  lines.reduce(
    (t, l) => ({ bags: t.bags + l.bags, valuePaise: t.valuePaise + l.valuePaise, unvaluedBags: t.unvaluedBags + l.unvaluedBags, entries: t.entries + l.entries }),
    { bags: 0, valuePaise: 0, unvaluedBags: 0, entries: 0 },
  );

describe("lossReport", () => {
  it("empty input", () => {
    expect(lossReport([], range, costs, names)).toEqual({
      byReason: [],
      byPlace: [],
      total: { bags: 0, valuePaise: 0, unvaluedBags: 0, entries: 0 },
    });
  });

  it("groups by reason in the STOCK_REASONS order, old rows without a code last as Not given", () => {
    const r = lossReport(
      [loss(-1, null), loss(-2, "other"), loss(-3, "damage"), loss(-4, "transit_short"), loss(-5, "damage")],
      range,
      costs,
      names,
    );
    expect(r.byReason.map((l) => [l.label, l.bags, l.entries, l.valuePaise])).toEqual([
      ["Transit short", 4, 1, 140_000],
      ["Damaged", 8, 2, 280_000],
      ["Other", 2, 1, 70_000],
      ["Not given", 1, 1, 35_000],
    ]);
  });

  it("ignores plus corrections and other movement types", () => {
    const r = lossReport(
      [
        loss(10, "entry_mistake"),
        loss(-20, null, { type: "dispatch" }),
        loss(-20, null, { type: "transfer" }),
        loss(0, "damage"),
        loss(-2, "damage"),
      ],
      range,
      costs,
      names,
    );
    expect(r.total).toEqual({ bags: 2, valuePaise: 70_000, unvaluedBags: 0, entries: 1 });
    expect(r.byReason.map((l) => l.key)).toEqual(["damage"]);
  });

  it("counts only the range, from India midnight to India midnight", () => {
    const r = lossReport(
      [
        loss(-1, "damage", { createdAt: "2026-09-30T18:29:00Z" }), // 23:59 IST on 30 Sep: before
        loss(-2, "damage", { createdAt: "2026-09-30T18:30:00Z" }), // 00:00 IST on 1 Oct: in
        loss(-4, "damage", { createdAt: "2026-10-05T18:29:59Z" }), // 23:59 IST on 5 Oct: in
        loss(-8, "damage", { createdAt: "2026-10-05T18:30:00Z" }), // 00:00 IST on 6 Oct: after
      ],
      range,
      costs,
      names,
    );
    expect(r.total.bags).toBe(6);
  });

  it("bags of a product with unknown cost are counted apart and not valued", () => {
    const r = lossReport([loss(-3, "damage", { productId: "p2" }), loss(-2, "damage"), loss(-1, "damage", { productId: "p3" })], range, costs, names);
    expect(r.total).toEqual({ bags: 6, valuePaise: 70_000, unvaluedBags: 4, entries: 3 });
    expect(r.byReason[0]).toMatchObject({ bags: 6, valuePaise: 70_000, unvaluedBags: 4 });
  });

  it("values in exact whole paise, also with a rounded average cost", () => {
    // 3 purchases with costs that do not divide evenly: average rounded to the paisa by mulDivRound.
    const totals = purchaseCostTotals([
      { productId: "p1", bags: 1, unitCostPaise: 33_333 },
      { productId: "p1", bags: 1, unitCostPaise: 33_333 },
      { productId: "p1", bags: 1, unitCostPaise: 33_334 },
    ]);
    const avg = averageCostPerBag(totals.get("p1"));
    expect(avg).toBe(mulDivRound(1, 100_000, 3));
    expect(avg).toBe(33_333);
    const r = lossReport([loss(-3, "damage")], range, new Map([["p1", avg]]), names);
    expect(r.total.valuePaise).toBe(99_999);
    expect(Number.isInteger(r.total.valuePaise)).toBe(true);
  });

  it("groups by place, godowns first then trucks, each by name", () => {
    const r = lossReport(
      [loss(-1, "damage"), loss(-2, "transit_burst", { godownId: null, vehicleId: "v1" }), loss(-3, "expired", { godownId: "g2" }), loss(-4, null)],
      range,
      costs,
      names,
    );
    expect(r.byPlace.map((l) => [l.label, l.kind, l.bags, l.entries])).toEqual([
      ["Annex", "godown", 3, 1],
      ["Main", "godown", 5, 2],
      ["BR01AB1234", "vehicle", 2, 1],
    ]);
  });

  it("totals equal the sum of the groups, by reason and by place", () => {
    const r = lossReport(
      [
        loss(-1, "damage"),
        loss(-2, "transit_burst", { godownId: null, vehicleId: "v1" }),
        loss(-3, "expired", { godownId: "g2", productId: "p2" }),
        loss(-4, null),
        loss(5, "entry_mistake"),
      ],
      range,
      costs,
      names,
    );
    expect(sum(r.byReason)).toEqual(r.total);
    expect(sum(r.byPlace)).toEqual(r.total);
    expect(r.total).toEqual({ bags: 10, valuePaise: 245_000, unvaluedBags: 3, entries: 4 });
  });
});
