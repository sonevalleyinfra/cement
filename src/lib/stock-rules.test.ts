import { describe, expect, it } from "vitest";
import {
  adjustmentMovement,
  balance,
  canSetOpening,
  cleanLocationName,
  canDispatch,
  canSwitchOffPlace,
  inMovement,
  parsePlaceKey,
  placeColumns,
  placeGroups,
  placeKey,
  MAX_STOCK_ENTRY_BAGS,
  transferMovements,
  checkTransferPlaces,
  NEW_TRUCK_PLACE,
  STOCK_FIX_REASONS,
  stockFixText,
  type Movement,
  type StockKey,
} from "./stock-rules";

const A: StockKey = { productId: "p1", placeKey: "g1" };
const B: StockKey = { productId: "p1", placeKey: "g2" };
const mv = (k: StockKey, bags: number, extra: Partial<Movement> = {}): Movement => ({
  ...k,
  type: bags >= 0 ? "purchase" : "dispatch",
  bags,
  ...extra,
});

describe("balance", () => {
  it("is zero with no movements", () => expect(balance([], A)).toBe(0));
  it("sums signed movements", () => {
    expect(balance([mv(A, 100), mv(A, -30), mv(A, 5)], A)).toBe(75);
  });
  it("keeps products and places separate", () => {
    const list = [mv(A, 100), mv(B, 50), mv({ ...A, productId: "p2" }, 7), mv({ ...A, placeKey: "v1" }, 9)];
    expect(balance(list, A)).toBe(100);
    expect(balance(list, B)).toBe(50);
  });
});

describe("canDispatch", () => {
  it("allows up to the balance", () => {
    expect(canDispatch(10, 10).ok).toBe(true);
    expect(canDispatch(10, 11).ok).toBe(false);
  });
  it("rejects zero, negative and fractions", () => {
    for (const n of [0, -1, 1.5, NaN]) expect(canDispatch(100, n).ok).toBe(false);
  });
  it("rejects when the balance is zero or negative", () => {
    expect(canDispatch(0, 1).ok).toBe(false);
    expect(canDispatch(-5, 1).ok).toBe(false);
  });
});

describe("adjustmentMovement", () => {
  const list = [mv(A, 20)];
  it("needs admin", () => {
    expect(adjustmentMovement(list, A, -1, "damage", "", "logistics").ok).toBe(false);
    expect(adjustmentMovement(list, A, -1, "damage", "", null).ok).toBe(false);
  });
  it("needs a reason from the list: damage, burst, shortage, count", () => {
    expect(STOCK_FIX_REASONS).toEqual(["damage", "burst", "shortage", "count"]);
    expect(adjustmentMovement(list, A, -1, "", "rain", "admin")).toEqual({ ok: false, error: "Pick a reason." });
    expect(adjustmentMovement(list, A, -1, "found", "", "admin").ok).toBe(false);
  });
  it("rejects zero and fractions", () => {
    expect(adjustmentMovement(list, A, 0, "count", "", "admin").ok).toBe(false);
    expect(adjustmentMovement(list, A, 1.5, "count", "", "admin").ok).toBe(false);
  });
  it("refuses more than the per-entry limit", () => {
    expect(adjustmentMovement(list, A, MAX_STOCK_ENTRY_BAGS + 1, "count", "", "admin").ok).toBe(false);
  });
  it("cannot take stock below zero", () => {
    expect(adjustmentMovement(list, A, -21, "count", "", "admin").ok).toBe(false);
    expect(adjustmentMovement(list, A, -20, "count", "", "admin").ok).toBe(true);
  });
  it("keeps the reason and the optional note together", () => {
    const r = adjustmentMovement(list, A, -2, "burst", "  torn  while unloading ", "sales,admin");
    expect(r.ok && r.movement).toMatchObject({ type: "adjustment", bags: -2, reason: "Burst bags: torn while unloading" });
    const g = adjustmentMovement(list, A, 5, "count", "", "admin");
    expect(g.ok && g.movement.reason).toBe("Count");
  });
  it("stockFixText caps the note", () => {
    expect(stockFixText("damage", "x".repeat(500))).toHaveLength(200);
    expect(stockFixText("shortage", null)).toBe("Shortage");
  });
});

describe("checkTransferPlaces", () => {
  const g1 = "godown:3f2b6c1e-8a4d-4f7e-9b1a-2c3d4e5f6a7b";
  const v1 = "vehicle:4f2b6c1e-8a4d-4f7e-9b1a-2c3d4e5f6a7b";
  it("moves between two existing places", () => {
    expect(checkTransferPlaces(g1, v1)).toMatchObject({ ok: true, to: { kind: "vehicle" } });
  });
  it("can load a new hired truck, even with only one godown", () => {
    expect(checkTransferPlaces(g1, NEW_TRUCK_PLACE)).toMatchObject({ ok: true, to: NEW_TRUCK_PLACE });
  });
  it("bags never come from a new (empty) truck; same place and junk are refused", () => {
    expect(checkTransferPlaces(NEW_TRUCK_PLACE, g1).ok).toBe(false);
    expect(checkTransferPlaces(g1, g1)).toEqual({ ok: false, error: "Pick two different places." });
    expect(checkTransferPlaces("x", g1).ok).toBe(false);
    expect(checkTransferPlaces(g1, undefined).ok).toBe(false);
  });
});

describe("transferMovements", () => {
  it("moves bags from one place to another", () => {
    const r = transferMovements([mv(A, 30)], A, "v1", 10);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const all = [mv(A, 30), ...r.movements];
      expect(balance(all, A)).toBe(20);
      expect(balance(all, { ...A, placeKey: "v1" })).toBe(10);
    }
  });
  it("refuses more than available, the same place, or bags that are elsewhere", () => {
    expect(transferMovements([mv(A, 5)], A, "v1", 6).ok).toBe(false);
    expect(transferMovements([mv(A, 5)], A, "g1", 1).ok).toBe(false);
    expect(transferMovements([mv(B, 50)], A, "v1", 1).ok).toBe(false);
  });
  it("refuses zero, fractions and more than the per-entry limit", () => {
    const big = [mv(A, MAX_STOCK_ENTRY_BAGS + 10)];
    expect(transferMovements(big, A, "v1", 0).ok).toBe(false);
    expect(transferMovements(big, A, "v1", 1.5).ok).toBe(false);
    expect(transferMovements(big, A, "v1", MAX_STOCK_ENTRY_BAGS).ok).toBe(true);
    expect(transferMovements(big, A, "v1", MAX_STOCK_ENTRY_BAGS + 1).ok).toBe(false);
  });
});

describe("inMovement", () => {
  it("adds positive whole bags", () => {
    expect(inMovement("purchase", A, 10).ok).toBe(true);
    expect(inMovement("opening", A, 0).ok).toBe(false);
    expect(inMovement("purchase", A, -3).ok).toBe(false);
  });
  it("refuses more than the per-entry limit", () => {
    expect(inMovement("purchase", A, MAX_STOCK_ENTRY_BAGS).ok).toBe(true);
    expect(inMovement("purchase", A, MAX_STOCK_ENTRY_BAGS + 1).ok).toBe(false);
    expect(inMovement("purchase", A, Number.MAX_SAFE_INTEGER).ok).toBe(false);
  });
});

describe("canSetOpening", () => {
  it("allows the first opening", () => expect(canSetOpening([], A).ok).toBe(true));
  it("blocks a second opening for the same product and place", () => {
    const first = mv(A, 10, { type: "opening" });
    expect(canSetOpening([first], A).ok).toBe(false);
    expect(canSetOpening([first], B).ok).toBe(true);
    expect(canSetOpening([first], { ...A, productId: "p2" }).ok).toBe(true);
  });
  it("ignores purchases", () => expect(canSetOpening([mv(A, 10)], A).ok).toBe(true));
});

describe("cleanLocationName", () => {
  it("tidies spaces", () => expect(cleanLocationName("  Main   godown ")).toBe("Main godown"));
  it("rejects empty", () => expect(cleanLocationName("   ")).toBeNull());
});

describe("place keys", () => {
  const id = "0b9c7f2e-1d4a-4c3b-9a8e-123456789abc";
  it("round-trips a godown and a vehicle", () => {
    expect(parsePlaceKey(placeKey({ kind: "godown", id }))).toEqual({ kind: "godown", id });
    expect(parsePlaceKey(placeKey({ kind: "vehicle", id }))).toEqual({ kind: "vehicle", id });
  });
  it("refuses anything else", () => {
    expect(parsePlaceKey(`shop:${id}`)).toBeNull();
    expect(parsePlaceKey("godown:not-a-uuid")).toBeNull();
    expect(parsePlaceKey(`godown:${id}:x`)).toBeNull();
    expect(parsePlaceKey(id)).toBeNull();
    expect(parsePlaceKey(42)).toBeNull();
  });
});

describe("placeColumns", () => {
  const id = "0b9c7f2e-1d4a-4c3b-9a8e-123456789abc";
  it("fills exactly one column", () => {
    expect(placeColumns(placeKey({ kind: "godown", id }))).toEqual({ godownId: id, vehicleId: null });
    expect(placeColumns(placeKey({ kind: "vehicle", id }))).toEqual({ godownId: null, vehicleId: id });
  });
  it("throws on a key that is not a place", () => {
    expect(() => placeColumns("shop:1")).toThrow();
  });
});

describe("canSwitchOffPlace", () => {
  it("refuses while there are bags there", () => {
    expect(canSwitchOffPlace(1)).toEqual({ ok: false, error: "Move the bags out first." });
    expect(canSwitchOffPlace(0)).toEqual({ ok: true });
  });
});

describe("placeGroups", () => {
  it("puts godowns first and drops empty sections", () => {
    expect(
      placeGroups([
        { key: "vehicle:1", kind: "vehicle", name: "BR01AB1234" },
        { key: "godown:2", kind: "godown", name: "Main Godown" },
      ]),
    ).toEqual([
      { label: "Godowns", options: [{ value: "godown:2", label: "Main Godown" }] },
      { label: "Trucks", options: [{ value: "vehicle:1", label: "BR01AB1234" }] },
    ]);
    expect(placeGroups([{ key: "godown:2", kind: "godown", name: "Main Godown" }])).toHaveLength(1);
  });
});
