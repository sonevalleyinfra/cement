import { describe, expect, it } from "vitest";
import {
  ACTIVITY_GROUPS,
  AUDIT_ACTIONS,
  activitySentence,
  changedFields,
  groupFilter,
  groupOf,
  isActivityGroup,
  isAllowedAudit,
  referencedIds,
  type ActivityRow,
} from "./audit-rules";

describe("changedFields", () => {
  it("keeps only the fields that changed", () => {
    const res = changedFields({ name: "A", phone: "1", city: "X" }, { name: "B", phone: "1" });
    expect(res).toEqual({ before: { name: "A" }, after: { name: "B" } });
  });

  it("returns null when nothing changed", () => {
    expect(changedFields({ name: "A" }, { name: "A" })).toBeNull();
  });

  it("treats missing and null as the same", () => {
    expect(changedFields({ phone: null }, { phone: null })).toBeNull();
    expect(changedFields({}, { phone: null })).toBeNull();
  });

  it("compares lists by content", () => {
    expect(changedFields({ roles: ["a", "b"] }, { roles: ["a", "b"] })).toBeNull();
    expect(changedFields({ roles: ["a"] }, { roles: ["a", "b"] })).toEqual({
      before: { roles: ["a"] },
      after: { roles: ["a", "b"] },
    });
  });

  it("handles a new record (no before)", () => {
    expect(changedFields(undefined, { name: "A" })).toEqual({ before: { name: null }, after: { name: "A" } });
  });
});


describe("allowed entities and actions", () => {
  it("knows each logged action", () => {
    expect(isAllowedAudit("order", "place")).toBe(true);
    expect(isAllowedAudit("dispatch", "create")).toBe(true);
    expect(isAllowedAudit("payment", "reverse")).toBe(true);
    expect(isAllowedAudit("prism_entry", "credit")).toBe(true);
    expect(isAllowedAudit("stock", "transfer")).toBe(true);
  });

  it("refuses unknown pairs", () => {
    expect(isAllowedAudit("order", "dispatch")).toBe(false);
    expect(isAllowedAudit("nothing", "create")).toBe(false);
    expect(isAllowedAudit("toString", "create")).toBe(false);
    expect(isAllowedAudit("user", undefined)).toBe(false);
  });

  it("every entity is in exactly one filter group", () => {
    const grouped = Object.values(ACTIVITY_GROUPS).flat();
    expect([...grouped].sort()).toEqual(Object.keys(AUDIT_ACTIONS).sort());
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(groupOf("dispatch")).toBe("orders");
    expect(groupOf("ledger")).toBe("payments");
    expect(groupOf("vehicle")).toBe("masters");
    expect(groupOf("unknown")).toBeNull();
    expect(isActivityGroup("prism")).toBe(true);
    expect(groupFilter("prism")).toEqual({ entities: ["prism_entry"], extra: [{ entity: "stock", action: "purchase" }] });
    expect(groupFilter("orders").extra).toEqual([]);
    expect(isActivityGroup("constructor")).toBe(false);
  });
});

describe("activitySentence", () => {
  const names = new Map([
    ["u1", "Ramesh"],
    ["u2", "Suresh"],
    ["r1", "Sharma Traders"],
    ["r2", "Gupta Stores"],
    ["p1", "Prism Trade OPC 43"],
    ["g1", "Main Godown"],
    ["v1", "BR01AB1234"],
  ]);
  const row = (entity: string, action: string, details: Record<string, unknown>, entityId = "x"): ActivityRow => ({
    actorId: "u1",
    entity,
    entityId,
    action,
    details,
  });
  const say = (r: ActivityRow) => activitySentence(r, names);

  it("dispatch reads like the spec example", () => {
    expect(say(row("dispatch", "create", { bags: 50, productId: "p1", retailerId: "r1", amountPaise: 1_750_000 }))).toBe(
      "Ramesh dispatched 50 bags of Prism Trade OPC 43 to Sharma Traders (₹17,500)",
    );
  });

  it("orders", () => {
    expect(say(row("order", "place", { bags: 100, productId: "p1", retailerId: "r1" }))).toBe(
      "Ramesh placed an order for 100 bags of Prism Trade OPC 43 for Sharma Traders",
    );
    expect(say(row("order", "fill_rate", { retailerId: "r1", ratePaise: { before: null, after: 35_000 } }))).toBe(
      "Ramesh filled the rate on Sharma Traders' order: ₹350 a bag",
    );
    expect(
      say(row("order", "change_rate", { retailerId: "r2", ratePaise: { before: 35_000, after: 36_050 }, reason: "Price rise" })),
    ).toBe("Ramesh changed the rate on Gupta Stores' order from ₹350 to ₹360.50 a bag: Price rise");
    expect(say(row("order", "approve", { retailerId: "r1", bags: 1 }))).toBe("Ramesh approved Sharma Traders' order for 1 bag");
    expect(say(row("order", "reject", { retailerId: "r1", bags: 5, reason: "Dues too high" }))).toBe(
      "Ramesh rejected Sharma Traders' order for 5 bags: Dues too high",
    );
    expect(say(row("order", "cancel", { retailerId: "r1", cancelledBags: 60, reason: "Shop closed" }))).toBe(
      "Ramesh cancelled 60 bags of Sharma Traders' order: Shop closed",
    );
  });

  it("stock", () => {
    expect(
      say(row("stock", "purchase", { bags: 200, productId: "p1", place: "godown:g1", unitCostPaise: 28_000, amountPaise: 5_600_000 })),
    ).toBe("Ramesh bought 200 bags of Prism Trade OPC 43 into Main Godown at ₹280 a bag (₹56,000 to Prism)");
    expect(say(row("stock", "adjustment", { bags: -5, productId: "p1", place: "godown:g1", reason: "burst" }))).toBe(
      "Ramesh corrected Prism Trade OPC 43 at Main Godown by −5 bags: burst",
    );
    expect(say(row("stock", "transfer", { bags: 20, productId: "p1", from: "godown:g1", to: "vehicle:v1" }))).toBe(
      "Ramesh moved 20 bags of Prism Trade OPC 43 from Main Godown to BR01AB1234",
    );
    expect(say(row("stock", "opening", { bags: 500, productId: "p1", place: "godown:g1" }))).toBe(
      "Ramesh set opening stock of 500 bags of Prism Trade OPC 43 at Main Godown",
    );
  });

  it("payments and cash", () => {
    expect(say(row("payment", "record", { amountPaise: 1_000_000, mode: "cash", retailerId: "r1" }))).toBe(
      "Ramesh recorded ₹10,000 cash from Sharma Traders",
    );
    expect(say(row("payment", "record", { amountPaise: 700_050, mode: "online", retailerId: "r1", utr: "UTR1" }))).toBe(
      "Ramesh recorded ₹7,000.50 online from Sharma Traders (UTR UTR1)",
    );
    expect(say(row("payment", "reverse", { amountPaise: 200_000, mode: "cash", retailerId: "r1", reason: "Wrong shop" }))).toBe(
      "Ramesh reversed ₹2,000 cash payment from Sharma Traders: Wrong shop",
    );
    expect(say(row("handover", "confirm", { amountPaise: 400_000, requestedPaise: 500_000, collectorId: "u2" }))).toBe(
      "Ramesh received ₹4,000 cash from Suresh (₹5,000 asked)",
    );
    expect(say(row("handover", "request", { amountPaise: 500_000, collectorId: "u1" }))).toBe(
      "Ramesh asked to hand over ₹5,000 cash",
    );
    expect(say(row("ledger", "adjustment", { amountPaise: -50_000, retailerId: "r1", reason: "Discount" }))).toBe(
      "Ramesh adjusted Sharma Traders' dues by −₹500: Discount",
    );
    expect(say(row("ledger", "opening", { amountPaise: -30_000, retailerId: "r1" }))).toBe(
      "Ramesh set Sharma Traders' opening balance: advance ₹300",
    );
  });

  it("prism and masters", () => {
    expect(say(row("prism_entry", "payment", { amountPaise: -50_000_000, mode: "bank", reference: "UTRX" }))).toBe(
      "Ramesh paid Prism ₹5,00,000 by bank (UTRX)",
    );
    expect(say(row("retailer", "create", { name: "New Shop" }, "rNew"))).toBe("Ramesh added retailer New Shop");
    expect(say(row("retailer", "assign_sales_rep", { salesRepId: { before: null, after: "u2" } }, "r1"))).toBe(
      "Ramesh made Suresh the sales person of Sharma Traders",
    );
    expect(say(row("godown", "deactivate", {}, "g1"))).toBe("Ramesh switched off godown Main Godown");
    expect(say(row("grade", "rename", { from: "43", to: "43S" }))).toBe("Ramesh renamed grade 43 to 43S");
  });

  it("unknown names and old rows still read", () => {
    expect(activitySentence(row("dispatch", "create", {}), new Map())).toBe("Someone dispatched cement to a shop");
    expect(say({ ...row("order", "fill_rate", { ratePaise: { before: null, after: 1000 } }), details: null })).toBe(
      "Ramesh filled the rate on a shop's order",
    );
    expect(say(row("mystery", "do_thing", {}))).toBe("Ramesh do thing mystery");
  });
});

describe("referencedIds", () => {
  it("collects actors, named records, ids in details and places", () => {
    const ids = referencedIds([
      { actorId: "u1", entity: "retailer", entityId: "r1", action: "assign_sales_rep", details: { salesRepId: { before: "u2", after: "u3" } } },
      { actorId: "u1", entity: "stock", entityId: "m1", action: "transfer", details: { productId: "p1", from: "godown:g1", to: "vehicle:v1" } },
      { actorId: "u4", entity: "dispatch", entityId: "d1", action: "create", details: null },
    ]);
    expect(ids.sort()).toEqual(["g1", "p1", "r1", "u1", "u2", "u3", "u4", "v1"]);
  });
});
