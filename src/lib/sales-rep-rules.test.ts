import { describe, expect, it } from "vitest";
import {
  checkSalesRepPick,
  movesWithSalesRep,
  orderSalesRep,
  pickableSalesReps,
  salesRepOnAdd,
} from "./sales-rep-rules";

describe("orderSalesRep", () => {
  it("always uses the retailer's sales person when there is one", () => {
    expect(orderSalesRep("rep", { id: "rep", role: "sales" })).toBe("rep");
    expect(orderSalesRep("rep", { id: "other", role: "sales" })).toBe("rep");
    expect(orderSalesRep("rep", { id: "shop", role: "retailer" })).toBe("rep");
    expect(orderSalesRep("rep", { id: "boss", role: "admin" })).toBe("rep");
  });

  it("falls back to a sales placer when the shop has nobody", () => {
    expect(orderSalesRep(null, { id: "s1", role: "sales" })).toBe("s1");
    expect(orderSalesRep(null, { id: "s1", role: "sales,logistics" })).toBe("s1");
  });

  it("leaves it empty when the shop has nobody and the placer is not sales", () => {
    expect(orderSalesRep(null, { id: "shop", role: "retailer" })).toBeNull();
    expect(orderSalesRep(null, { id: "boss", role: "admin" })).toBeNull();
    expect(orderSalesRep(null, { id: "x", role: null })).toBeNull();
  });
});

describe("salesRepOnAdd", () => {
  it("a sales person adding a shop looks after it", () => {
    expect(salesRepOnAdd({ id: "s1", role: "sales" })).toBe("s1");
  });
  it("admin adding a shop leaves it for admin to pick", () => {
    expect(salesRepOnAdd({ id: "a1", role: "admin" })).toBeNull();
    expect(salesRepOnAdd({ id: "a1", role: "admin,sales" })).toBeNull();
  });
  it("nobody else gets it", () => {
    expect(salesRepOnAdd({ id: "l1", role: "logistics" })).toBeNull();
  });
});

const person = (over: Partial<{ id: string; role: string | null; banned: boolean | null; deletedAt: Date | null }> = {}) => ({
  id: "s1",
  role: "sales" as string | null,
  banned: false as boolean | null,
  deletedAt: null as Date | null,
  ...over,
});

describe("pickableSalesReps", () => {
  it("keeps only active, not deleted sales people", () => {
    const list = [
      person({ id: "a" }),
      person({ id: "b", role: "accounts" }),
      person({ id: "c", banned: true }),
      person({ id: "d", deletedAt: new Date() }),
      person({ id: "e", role: "sales,logistics" }),
    ];
    expect(pickableSalesReps(list).map((p) => p.id)).toEqual(["a", "e"]);
  });
});

describe("checkSalesRepPick", () => {
  it("allows nobody", () => expect(checkSalesRepPick(null, undefined)).toEqual({ ok: true }));
  it("allows an active sales person", () => expect(checkSalesRepPick("s1", person())).toEqual({ ok: true }));
  it("refuses an unknown, deactivated, deleted or non-sales person", () => {
    expect(checkSalesRepPick("s1", undefined).ok).toBe(false);
    expect(checkSalesRepPick("s1", person({ id: "other" })).ok).toBe(false);
    expect(checkSalesRepPick("s1", person({ banned: true })).ok).toBe(false);
    expect(checkSalesRepPick("s1", person({ deletedAt: new Date() })).ok).toBe(false);
    expect(checkSalesRepPick("s1", person({ role: "retailer" })).ok).toBe(false);
  });
});

describe("movesWithSalesRep", () => {
  it("moves unfinished orders", () => {
    for (const s of ["placed", "approved", "partly_dispatched"]) {
      expect(movesWithSalesRep(s)).toBe(true);
    }
  });
  it("keeps finished orders with the old sales person", () => {
    for (const s of ["dispatched", "rejected", "cancelled", "nonsense"]) expect(movesWithSalesRep(s)).toBe(false);
  });
});
