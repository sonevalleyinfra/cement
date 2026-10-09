import { describe, expect, it } from "vitest";
import { buildNotifications, recipientIds, type OrderPeople } from "./notification-rules";

const people: OrderPeople = {
  salesRepId: "rep",
  placedBy: "placer",
  retailerUserId: "shop",
  accountsIds: ["acc1", "acc2"],
  adminIds: ["adm"],
};

describe("recipientIds", () => {
  it("placed: accounts and sales rep", () => {
    expect(recipientIds("placed", people, "placer")).toEqual(["acc1", "acc2", "rep"]);
  });
  it("rate filled: accounts, admin, sales rep (not the person who filled it)", () => {
    expect(recipientIds("rate_filled", people, "rep")).toEqual(["acc1", "acc2", "adm"]);
  });
  it("approved and rejected: placer, sales rep, admin", () => {
    expect(recipientIds("approved", people, "acc1")).toEqual(["placer", "rep", "adm"]);
    expect(recipientIds("rejected", people, "acc1")).toEqual(["placer", "rep", "adm"]);
  });
  it("dispatched and delivered: retailer and sales rep", () => {
    expect(recipientIds("dispatched", people, "log")).toEqual(["shop", "rep"]);
    expect(recipientIds("delivered", people, "log")).toEqual(["shop", "rep"]);
  });
  it("cancelled: placer, sales rep, admin", () => {
    expect(recipientIds("cancelled", people, "x")).toEqual(["placer", "rep", "adm"]);
  });
  it("skips empty people and duplicates", () => {
    const p = { ...people, salesRepId: "placer", retailerUserId: null, adminIds: ["placer"] };
    expect(recipientIds("approved", p, null)).toEqual(["placer"]);
    expect(recipientIds("dispatched", p, null)).toEqual(["placer"]);
  });
});

describe("buildNotifications", () => {
  const base = { firmName: "Firm A", retailerName: "Raju Stores", bags: 1, people, actorId: "placer" };
  it("puts the firm name first and has no price", () => {
    const list = buildNotifications({ ...base, event: "placed" });
    expect(list).toHaveLength(3);
    expect(list[0].title).toBe("Firm A: New order");
    expect(list[0].body).toBe("Raju Stores, 1 bag placed.");
    for (const n of buildNotifications({ ...base, event: "rate_filled", bags: 5 })) {
      expect(n.body).not.toMatch(/₹|rs\.?\s?\d/i);
    }
  });
  it("writes a message for every event", () => {
    for (const event of ["approved", "rejected", "dispatched", "delivered", "cancelled"] as const) {
      const list = buildNotifications({ ...base, event, bags: 10 });
      expect(list.length).toBeGreaterThan(0);
      expect(list[0].type).toBe(event);
      expect(list[0].title.startsWith("Firm A: ")).toBe(true);
    }
  });
  it("a partial dispatch names the bags that left, not the whole order", () => {
    const list = buildNotifications({ ...base, event: "dispatched", bags: 20 });
    expect(list[0].body).toBe("Raju Stores, 20 bags is on its way.");
  });
});
