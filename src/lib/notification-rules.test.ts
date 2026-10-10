import { describe, expect, it } from "vitest";
import {
  buildMoneyNotifications,
  buildNotifications,
  defaultMoneyLink,
  isSafeInternalPath,
  MONEY_EVENTS,
  moneyRecipientIds,
  NOTIFICATION_EVENTS,
  notificationTarget,
  recipientIds,
  type OrderPeople,
} from "./notification-rules";

const people: OrderPeople = {
  salesRepId: "rep",
  placedBy: "placer",
  retailerUserId: "shop",
  logisticsId: "log",
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
  it("assigned: only the logistics member picked for the order", () => {
    expect(recipientIds("assigned", people, "acc1")).toEqual(["log"]);
    expect(recipientIds("assigned", { ...people, logisticsId: null }, "acc1")).toEqual([]);
  });
  it("assigned: logistics is not told when they assigned it to themselves", () => {
    expect(recipientIds("assigned", people, "log")).toEqual([]);
  });
  it("rate edited: accounts, admin, sales rep (not the editor)", () => {
    expect(recipientIds("rate_edited", people, "log")).toEqual(["acc1", "acc2", "adm", "rep"]);
    expect(recipientIds("rate_edited", people, "acc2")).toEqual(["acc1", "adm", "rep"]);
  });
  it("rate edited: someone with two roles is told once", () => {
    const p = { ...people, accountsIds: ["rep", "acc1"], adminIds: ["acc1"] };
    expect(recipientIds("rate_edited", p, null)).toEqual(["rep", "acc1"]);
  });
  it("skips empty people and duplicates", () => {
    const p = { ...people, salesRepId: "placer", retailerUserId: null, adminIds: ["placer"] };
    expect(recipientIds("approved", p, null)).toEqual(["placer"]);
    expect(recipientIds("dispatched", p, null)).toEqual(["placer"]);
  });
});

describe("buildNotifications", () => {
  const base = { retailerName: "Raju Stores", bags: 1, people, actorId: "placer" };
  it("names the event and has no price", () => {
    const list = buildNotifications({ ...base, event: "placed" });
    expect(list).toHaveLength(3);
    expect(list[0].title).toBe("New order");
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
    }
  });
  it("assigned and rate edited messages, without a price", () => {
    const a = buildNotifications({ ...base, event: "assigned", bags: 10 });
    expect(a).toEqual([
      { userId: "log", type: "assigned", title: "Order assigned", body: "Raju Stores, 10 bags to dispatch.", link: null },
    ]);
    const r = buildNotifications({ ...base, event: "rate_edited", bags: 10, actorId: "log" });
    expect(r.map((n) => n.userId)).toEqual(["acc1", "acc2", "adm", "rep"]);
    expect(r[0].title).toBe("Rate edited");
    expect(r[0].body).toBe("Raju Stores, 10 bags.");
  });
  it("no order message ever contains a price or money sign", () => {
    for (const event of NOTIFICATION_EVENTS) {
      for (const n of buildNotifications({ ...base, event, bags: 25, actorId: null })) {
        expect(`${n.title} ${n.body}`).not.toMatch(/₹|rs\.?\s?\d|paise|rupee/i);
        expect(n.link).toBeNull();
      }
    }
  });
  it("a partial dispatch names the bags that left, not the whole order", () => {
    const list = buildNotifications({ ...base, event: "dispatched", bags: 20 });
    expect(list[0].body).toBe("Raju Stores, 20 bags is on its way.");
  });
});

describe("money notifications", () => {
  const people = { adminIds: ["adm1", "adm2"], collectorId: "col" };
  const base = {
    retailerName: "Raju Stores",
    amountPaise: 500000,
    people,
    actorId: "col",
  };

  it("payment recorded goes to every admin, not the collector", () => {
    expect(moneyRecipientIds("payment_recorded", people, "col")).toEqual(["adm1", "adm2"]);
  });
  it("an admin who records a payment is not told about it", () => {
    expect(moneyRecipientIds("payment_recorded", people, "adm1")).toEqual(["adm2"]);
  });
  it("verified, handover and reversal go to the collector only", () => {
    for (const event of ["online_verified", "handover_confirmed", "handover_rejected", "receipt_reversed"] as const) {
      expect(moneyRecipientIds(event, people, "acc")).toEqual(["col"]);
      expect(moneyRecipientIds(event, people, "col")).toEqual([]);
      expect(moneyRecipientIds(event, { ...people, collectorId: null }, "acc")).toEqual([]);
    }
  });
  it("nobody is told twice", () => {
    expect(moneyRecipientIds("payment_recorded", { adminIds: ["a", "a", "b"], collectorId: null }, null)).toEqual([
      "a",
      "b",
    ]);
  });

  it("payment recorded: amount in rupees, opens the receipts", () => {
    expect(buildMoneyNotifications({ ...base, event: "payment_recorded" })).toEqual([
      { userId: "adm1", type: "payment_recorded", title: "Payment recorded", body: "₹5,000.00 from Raju Stores.", link: "/receipts" },
      { userId: "adm2", type: "payment_recorded", title: "Payment recorded", body: "₹5,000.00 from Raju Stores.", link: "/receipts" },
    ]);
  });
  it("online verified", () => {
    const [n] = buildMoneyNotifications({ ...base, event: "online_verified", actorId: "acc" });
    expect(n).toEqual({
      userId: "col",
      type: "online_verified",
      title: "Online payment verified",
      body: "₹5,000.00 from Raju Stores verified.",
      link: "/receipts",
    });
  });
  it("handover confirmed and rejected open the wallet; a reason is added", () => {
    const [ok] = buildMoneyNotifications({ ...base, event: "handover_confirmed", retailerName: null, actorId: "acc" });
    expect(ok).toMatchObject({ title: "Handover confirmed", body: "₹5,000.00 cash handover confirmed.", link: "/wallet" });
    const [no] = buildMoneyNotifications({ ...base, event: "handover_rejected", actorId: "acc", reason: " Count is short " });
    expect(no).toMatchObject({ title: "Handover rejected", body: "₹5,000.00 cash handover rejected. Reason: Count is short", link: "/wallet" });
  });
  it("receipt reversed, with the caller's link and reason", () => {
    const [n] = buildMoneyNotifications({ ...base, event: "receipt_reversed", actorId: "acc", link: "/receipts/r1", reason: "Wrong shop" });
    expect(n).toEqual({
      userId: "col",
      type: "receipt_reversed",
      title: "Receipt reversed",
      body: "₹5,000.00 from Raju Stores reversed. Reason: Wrong shop",
      link: "/receipts/r1",
    });
  });
  it("every money event has a message and a link", () => {
    for (const event of MONEY_EVENTS) {
      const list = buildMoneyNotifications({ ...base, event, actorId: "someone-else" });
      expect(list.length).toBeGreaterThan(0);
      expect(isSafeInternalPath(list[0].link)).toBe(true);
      expect(list[0].link).toBe(defaultMoneyLink(event));
    }
  });
});

describe("notification links", () => {
  it("accepts paths inside the app", () => {
    expect(isSafeInternalPath("/wallet")).toBe(true);
    expect(isSafeInternalPath("/receipts/3f2a?x=1#top")).toBe(true);
  });
  it("refuses other sites and odd input", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "wallet",
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "/a\\b",
      "/\t/evil.com",
      "/\n/evil.com",
      "javascript:alert(1)",
      "/" + "a".repeat(400),
    ]) {
      expect(isSafeInternalPath(bad)).toBe(false);
    }
  });
  it("opens the link, else the order, else the list", () => {
    expect(notificationTarget("/wallet", "o1")).toBe("/wallet");
    expect(notificationTarget("//evil.com", "o1")).toBe("/orders/o1");
    expect(notificationTarget(null, "o1")).toBe("/orders/o1");
    expect(notificationTarget("https://evil.com", null)).toBe("/notifications");
    expect(notificationTarget(null, null)).toBe("/notifications");
  });
});
