import { describe, expect, it } from "vitest";
import { reportRange } from "./report-range";
import { placeFlows, stockFlows, stockNow, totalFlow, totalPlaceFlow, type StockMoveRow } from "./stock-report";

const range = reportRange({ from: "2026-10-01", to: "2026-10-05" });
const names = new Map([
  ["p1", "OPC 43"],
  ["p2", "PPC"],
]);
const move = (type: string, bags: number, at: string, over: Partial<StockMoveRow> = {}): StockMoveRow => ({
  productId: "p1",
  godownId: "g1",
  vehicleId: null,
  type,
  bags,
  createdAt: at,
  ...over,
});

describe("stockFlows", () => {
  it("no data", () => {
    expect(stockFlows([], range, names)).toEqual([]);
    expect(totalFlow([])).toMatchObject({ closingBags: 0, reconciles: true });
  });

  it("start + opening stock + purchased − dispatched ± moved ± fixed = end", () => {
    const rows = [
      move("opening", 500, "2026-09-01T00:00:00Z"),
      move("dispatch", -50, "2026-09-30T18:29:00Z"), // 23:59 IST on 30 Sep: before the range
      move("purchase", 200, "2026-09-30T18:30:00Z"), // 00:00 IST on 1 Oct: in the range
      move("dispatch", -40, "2026-10-02T10:00:00Z"),
      move("transfer", -30, "2026-10-03T10:00:00Z"),
      move("transfer", 30, "2026-10-03T10:00:00Z", { godownId: null, vehicleId: "v1" }),
      move("adjustment", -5, "2026-10-04T10:00:00Z"),
      move("opening", 70, "2026-10-04T11:00:00Z", { godownId: "g2" }), // a new godown counted in the range
      move("purchase", 999, "2026-10-05T18:30:00Z"), // 00:00 IST on 6 Oct: after the range
    ];
    const [f] = stockFlows(rows, range, names);
    expect(f).toEqual({
      productId: "p1",
      label: "OPC 43",
      openingBags: 450,
      openingStockBags: 70,
      purchasedBags: 200,
      dispatchedBags: 40,
      movedBags: 0,
      movedInBags: 30,
      movedOutBags: 30,
      fixedBags: -5,
      closingBags: 675,
      reconciles: true,
    });
    expect(totalFlow([f])).toMatchObject({ openingStockBags: 70, fixedBags: -5, reconciles: true });
  });

  it("a godown to truck move nets to 0 but shows bags moved in and out", () => {
    const rows = [
      move("opening", 100, "2026-09-01T00:00:00Z"),
      move("transfer", -30, "2026-10-03T10:00:00Z"),
      move("transfer", 30, "2026-10-03T10:00:00Z", { godownId: null, vehicleId: "v1" }),
      move("transfer", -10, "2026-10-04T10:00:00Z", { godownId: null, vehicleId: "v1" }),
      move("transfer", 10, "2026-10-04T10:00:00Z"),
      move("transfer", -5, "2026-09-20T10:00:00Z"), // before the range: not counted
      move("transfer", 5, "2026-09-20T10:00:00Z", { godownId: null, vehicleId: "v1" }),
    ];
    const [f] = stockFlows(rows, range, names);
    expect(f).toMatchObject({ movedBags: 0, movedInBags: 40, movedOutBags: 40, reconciles: true });
    expect(totalFlow([f])).toMatchObject({ movedInBags: 40, movedOutBags: 40 });
  });

  it("opening stock entered in the range is its own line, never counted as a correction", () => {
    const [f] = stockFlows([move("opening", 100, "2026-10-02T00:00:00Z")], range, names);
    expect(f).toMatchObject({ openingBags: 0, openingStockBags: 100, fixedBags: 0, closingBags: 100, reconciles: true });
  });

  it("a dispatch reversal is not a movement kind any more: flagged if one ever shows up", () => {
    const [f] = stockFlows([move("dispatch_reversal", 10, "2026-10-02T00:00:00Z")], range, names);
    expect(f.reconciles).toBe(false);
  });

  it("flags a movement type it does not know", () => {
    const [f] = stockFlows([move("mystery", 10, "2026-10-02T00:00:00Z")], range, names);
    expect(f.reconciles).toBe(false);
    expect(totalFlow([f]).reconciles).toBe(false);
  });

  it("a product with only later movements is left out", () => {
    expect(stockFlows([move("purchase", 10, "2026-11-01T00:00:00Z")], range, names)).toEqual([]);
  });
});

describe("stockNow", () => {
  it("by product and by place, empty ones left out, godowns first", () => {
    const rows = [
      move("opening", 100, "x"),
      move("transfer", -100, "x"),
      move("transfer", 100, "x", { godownId: null, vehicleId: "v1" }),
      move("opening", 40, "x", { productId: "p2", godownId: "g2" }),
    ];
    const s = stockNow(rows, {
      products: names,
      godowns: new Map([
        ["g1", "Main"],
        ["g2", "Annex"],
      ]),
      vehicles: new Map([["v1", "BR01AB1234"]]),
    });
    expect(s.totalBags).toBe(140);
    expect(s.byProduct).toEqual([
      { productId: "p1", label: "OPC 43", bags: 100 },
      { productId: "p2", label: "PPC", bags: 40 },
    ]);
    expect(s.byPlace.map((p) => [p.label, p.kind, p.bags])).toEqual([
      ["Annex", "godown", 40],
      ["BR01AB1234", "vehicle", 100],
    ]);
  });
});

describe("placeFlows", () => {
  const places = {
    godowns: new Map([
      ["g1", "Main"],
      ["g2", "Annex"],
    ]),
    vehicles: new Map([["v1", "BR01AB1234"]]),
  };
  const truck = { godownId: null, vehicleId: "v1" };

  it("no data", () => {
    expect(placeFlows([], range, places)).toEqual([]);
    expect(totalPlaceFlow([])).toEqual({ openingBags: 0, inBags: 0, outBags: 0, closingBags: 0, reconciles: true });
  });

  it("opening + in − out = closing per place, boundaries at India midnight", () => {
    const rows = [
      move("opening", 500, "2026-09-01T00:00:00Z"),
      move("dispatch", -50, "2026-09-30T18:29:00Z"), // 23:59 IST on 30 Sep: before the range
      move("purchase", 200, "2026-09-30T18:30:00Z"), // 00:00 IST on 1 Oct: in the range
      move("dispatch", -40, "2026-10-02T10:00:00Z"),
      move("adjustment", -5, "2026-10-04T10:00:00Z"),
      move("adjustment", 2, "2026-10-04T11:00:00Z"),
      move("opening", 70, "2026-10-04T11:00:00Z"),
      move("purchase", 999, "2026-10-05T18:30:00Z"), // 00:00 IST on 6 Oct: after the range
    ];
    expect(placeFlows(rows, range, places)).toEqual([
      { key: "godown:g1", kind: "godown", label: "Main", openingBags: 450, inBags: 272, outBags: 45, closingBags: 677, reconciles: true },
    ]);
  });

  it("a transfer is out of one place and into another; the totals net to 0", () => {
    const rows = [
      move("opening", 100, "2026-09-01T00:00:00Z"),
      move("transfer", -30, "2026-10-03T10:00:00Z"),
      move("transfer", 30, "2026-10-03T10:00:00Z", truck),
      move("transfer", -10, "2026-10-04T10:00:00Z", truck),
      move("transfer", 10, "2026-10-04T10:00:00Z", { godownId: "g2" }),
    ];
    const list = placeFlows(rows, range, places);
    expect(list.map((p) => [p.label, p.kind, p.openingBags, p.inBags, p.outBags, p.closingBags])).toEqual([
      ["Annex", "godown", 0, 10, 0, 10],
      ["Main", "godown", 100, 0, 30, 70],
      ["BR01AB1234", "vehicle", 0, 30, 10, 20],
    ]);
    const t = totalPlaceFlow(list);
    expect(t.inBags - t.outBags).toBe(0);
    expect(t).toMatchObject({ openingBags: 100, closingBags: 100, reconciles: true });
  });

  it("leaves out a place with nothing before the end of the range, or all zero", () => {
    const rows = [
      move("opening", 10, "2026-09-01T00:00:00Z"),
      move("purchase", 10, "2026-11-01T00:00:00Z", { godownId: "g2" }), // after the range only
    ];
    expect(placeFlows(rows, range, places).map((p) => p.key)).toEqual(["godown:g1"]);
    // A truck loaded and emptied before the range: opening 0, nothing in the range, closing 0.
    const empty = [move("transfer", 5, "2026-09-02T00:00:00Z", truck), move("dispatch", -5, "2026-09-03T00:00:00Z", truck)];
    expect(placeFlows(empty, range, places)).toEqual([]);
  });

  it("closing per place equals stock now when the range ends after every movement", () => {
    const rows = [
      move("opening", 500, "2026-09-01T00:00:00Z"),
      move("opening", 40, "2026-09-01T00:00:00Z", { productId: "p2", godownId: "g2" }),
      move("purchase", 200, "2026-10-02T00:00:00Z"),
      move("transfer", -100, "2026-10-03T00:00:00Z"),
      move("transfer", 100, "2026-10-03T00:00:00Z", truck),
      move("dispatch", -60, "2026-10-03T05:00:00Z", truck),
      move("adjustment", -3, "2026-10-04T00:00:00Z", { productId: "p2", godownId: "g2" }),
      move("transfer", -40, "2026-10-04T00:00:00Z", truck),
      move("transfer", 40, "2026-10-04T00:00:00Z"),
    ];
    const future = reportRange({ from: "2026-10-01", to: "2030-12-31" });
    const list = placeFlows(rows, future, places);
    const now = stockNow(rows, { products: names, ...places });
    expect(list.every((p) => p.reconciles)).toBe(true);
    // The truck was loaded and emptied in the range: it shows here (in 100, out 100) with closing 0; stock now leaves 0 out.
    expect(list.find((p) => p.kind === "vehicle")).toMatchObject({ inBags: 100, outBags: 100, closingBags: 0 });
    const closing = list.filter((p) => p.closingBags !== 0);
    expect(Object.fromEntries(closing.map((p) => [p.key, p.closingBags]))).toEqual(Object.fromEntries(now.byPlace.map((p) => [p.key, p.bags])));
    expect(totalPlaceFlow(list).closingBags).toBe(now.totalBags);
  });

  it("flags a movement type it does not know", () => {
    const [p] = placeFlows([move("mystery", 10, "2026-10-02T00:00:00Z")], range, places);
    expect(p.reconciles).toBe(false);
    expect(totalPlaceFlow([p]).reconciles).toBe(false);
  });
});
