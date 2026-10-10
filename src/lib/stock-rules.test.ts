import { describe, expect, it } from "vitest";
import {
  adjustmentMovement,
  balance,
  canSetOpening,
  cleanLocationName,
  canDispatch,
  canSwitchOffPlace,
  dispatchMovement,
  firmProductTotal,
  inMovement,
  parsePlaceKey,
  placeGroups,
  placeKey,
  MAX_STOCK_ENTRY_BAGS,
  transferMovements,
  type Movement,
  type StockKey,
} from "./stock-rules";

const A: StockKey = { firmId: "A", productId: "p1", locationId: "g1" };
const B: StockKey = { firmId: "B", productId: "p1", locationId: "g1" };
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
  it("keeps firms, products and locations separate", () => {
    const list = [mv(A, 100), mv(B, 50), mv({ ...A, productId: "p2" }, 7), mv({ ...A, locationId: "v1" }, 9)];
    expect(balance(list, A)).toBe(100);
    expect(balance(list, B)).toBe(50);
    expect(firmProductTotal(list, "A", "p1")).toBe(109);
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

describe("dispatchMovement and firm isolation", () => {
  it("cannot use another firm's bags", () => {
    const list = [mv(B, 500)];
    expect(() => dispatchMovement(list, A, 1, "o1")).toThrow();
  });
  it("creates a negative movement for the same firm", () => {
    const m = dispatchMovement([mv(A, 50)], A, 20, "o1");
    expect(m).toMatchObject({ firmId: "A", type: "dispatch", bags: -20, orderId: "o1" });
  });
  it("never goes negative over a random run of attempts (property)", () => {
    let seed = 12345;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const list: Movement[] = [mv(A, 200), mv(B, 100)];
    for (let i = 0; i < 2000; i++) {
      const key = rand() < 0.5 ? A : B;
      const bags = Math.floor(rand() * 60) + 1;
      try {
        list.push(dispatchMovement(list, key, bags, `o${i}`));
      } catch {
        // refused: fine
      }
      if (rand() < 0.1) list.push(mv(key, Math.floor(rand() * 40) + 1));
      expect(balance(list, A)).toBeGreaterThanOrEqual(0);
      expect(balance(list, B)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("adjustmentMovement", () => {
  const list = [mv(A, 20)];
  it("needs admin", () => {
    expect(adjustmentMovement(list, A, -1, "damage", "logistics").ok).toBe(false);
    expect(adjustmentMovement(list, A, -1, "damage", null).ok).toBe(false);
  });
  it("needs a reason", () => {
    expect(adjustmentMovement(list, A, -1, "   ", "admin").ok).toBe(false);
  });
  it("rejects zero and fractions", () => {
    expect(adjustmentMovement(list, A, 0, "x", "admin").ok).toBe(false);
    expect(adjustmentMovement(list, A, 1.5, "x", "admin").ok).toBe(false);
  });
  it("refuses more than the per-entry limit", () => {
    expect(adjustmentMovement(list, A, MAX_STOCK_ENTRY_BAGS + 1, "x", "admin").ok).toBe(false);
  });
  it("cannot take stock below zero", () => {
    expect(adjustmentMovement(list, A, -21, "count", "admin").ok).toBe(false);
    expect(adjustmentMovement(list, A, -20, "count", "admin").ok).toBe(true);
  });
  it("allows gains and trims the reason", () => {
    const r = adjustmentMovement(list, A, 5, "  found  ", "sales,admin");
    expect(r.ok && r.movement).toMatchObject({ type: "adjustment", bags: 5, reason: "found" });
  });
});

describe("transferMovements", () => {
  it("moves bags within one firm", () => {
    const r = transferMovements([mv(A, 30)], A, "v1", 10);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const all = [mv(A, 30), ...r.movements];
      expect(balance(all, A)).toBe(20);
      expect(balance(all, { ...A, locationId: "v1" })).toBe(10);
    }
  });
  it("refuses more than available, same place, or other firm's stock", () => {
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
  it("blocks a second opening for the same firm, product and place", () => {
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

describe("canSwitchOffPlace", () => {
  it("refuses while any firm has bags there", () => {
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
      { label: "Vehicles", options: [{ value: "vehicle:1", label: "BR01AB1234" }] },
    ]);
    expect(placeGroups([{ key: "godown:2", kind: "godown", name: "Main Godown" }])).toHaveLength(1);
  });
});
