import { describe, expect, it } from "vitest";
import {
  adjustmentMovement,
  balance,
  canDispatch,
  dispatchMovement,
  firmProductTotal,
  inMovement,
  reversalMovements,
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

describe("reversalMovements", () => {
  it("returns the dispatched bags to the same place", () => {
    const list = [mv(A, 100), dispatchMovement([mv(A, 100)], A, 40, "o1")];
    const rev = reversalMovements(list, "o1");
    expect(rev).toHaveLength(1);
    expect(rev[0]).toMatchObject({ ...A, type: "dispatch_reversal", bags: 40, orderId: "o1" });
    expect(balance([...list, ...rev], A)).toBe(100);
  });
  it("does nothing for other orders or when already reversed", () => {
    const d = dispatchMovement([mv(A, 100)], A, 40, "o1");
    const list = [mv(A, 100), d];
    expect(reversalMovements(list, "o2")).toEqual([]);
    const again = [...list, ...reversalMovements(list, "o1")];
    expect(reversalMovements(again, "o1")).toEqual([]);
  });
  it("handles a dispatch split over two vehicles", () => {
    const list = [
      { ...A, type: "dispatch" as const, bags: -10, orderId: "o1" },
      { ...A, locationId: "v1", type: "dispatch" as const, bags: -5, orderId: "o1" },
    ];
    const rev = reversalMovements(list, "o1");
    expect(rev.map((r) => r.bags).sort((a, b) => a - b)).toEqual([5, 10]);
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
});

describe("inMovement", () => {
  it("adds positive whole bags", () => {
    expect(inMovement("purchase", A, 10).ok).toBe(true);
    expect(inMovement("opening", A, 0).ok).toBe(false);
    expect(inMovement("purchase", A, -3).ok).toBe(false);
  });
});
