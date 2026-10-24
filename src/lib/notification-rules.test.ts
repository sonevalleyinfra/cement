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
  rateChangeText,
  recipientIds,
  shopHasActiveSalesRep,
  type OrderPeople,
} from "./notification-rules";

const people: OrderPeople = {
  salesRepId: "rep",
  shopHasSalesRep: true,
  placedBy: "placer",
  retailerUserId: "shop",
  rateMissing: false,
  accountsIds: ["acc1", "acc2"],
  logisticsIds: ["log1", "log2"],
  adminIds: ["adm"],
};

describe("recipientIds (spec section 8)", () => {
  it("placed with a rate (by sales): accounts only", () => {
    expect(recipientIds("placed", people, "rep")).toEqual(["acc1", "acc2"]);
    expect(recipientIds("placed", { ...people, placedBy: "adm" }, "adm")).toEqual(["acc1", "acc2"]);
  });
  it("placed without a rate (by the retailer): the shop's sales person and accounts", () => {
    expect(recipientIds("placed", { ...people, placedBy: "shop", rateMissing: true }, "shop")).toEqual([
      "rep",
      "acc1",
      "acc2",
    ]);
  });
  it("placed for a shop with no sales person: admins are told too, so the order does not get stuck", () => {
    const noRep = { ...people, salesRepId: null, shopHasSalesRep: false, placedBy: "shop", rateMissing: true };
    expect(recipientIds("placed", noRep, "shop")).toEqual(["acc1", "acc2", "adm"]);
    expect(recipientIds("placed", { ...noRep, rateMissing: false, placedBy: "adm" }, "adm")).toEqual(["acc1", "acc2"]);
  });
  it("a shop whose sales person is deactivated counts as having none, so admins are told", () => {
    expect(shopHasActiveSalesRep("s1", ["s1", "adm"])).toBe(true);
    expect(shopHasActiveSalesRep("gone", ["s1", "adm"])).toBe(false);
    expect(shopHasActiveSalesRep(null, ["s1"])).toBe(false);
    const stale = { ...people, shopHasSalesRep: shopHasActiveSalesRep("gone", ["adm"]), placedBy: "shop", rateMissing: true };
    expect(recipientIds("placed", stale, "shop")).toContain("adm");
  });
  it("placed by a sales person for a shop with no sales person (the order is theirs): admins are told too", () => {
    const covering = { ...people, salesRepId: "sales2", shopHasSalesRep: false, placedBy: "sales2", rateMissing: false };
    expect(recipientIds("placed", covering, "sales2")).toEqual(["acc1", "acc2", "adm"]);
    // A shop with its own sales person: no admins.
    expect(recipientIds("placed", { ...covering, shopHasSalesRep: true }, "sales2")).toEqual(["acc1", "acc2"]);
  });
  it("a filled rate is no longer a notification event", () => {
    expect(NOTIFICATION_EVENTS as readonly string[]).not.toContain("rate_filled");
  });
  it("approved: placer, sales person and every logistics person", () => {
    expect(recipientIds("approved", people, "acc1")).toEqual(["placer", "rep", "log1", "log2"]);
  });
  it("rejected: placer and sales person", () => {
    expect(recipientIds("rejected", people, "acc1")).toEqual(["placer", "rep"]);
  });
  it("dispatched: retailer and sales person", () => {
    expect(recipientIds("dispatched", people, "log1")).toEqual(["shop", "rep"]);
  });
  it("rate changed: accounts, sales person, admin (not the person who changed it)", () => {
    expect(recipientIds("rate_edited", people, "log1")).toEqual(["acc1", "acc2", "rep", "adm"]);
    expect(recipientIds("rate_edited", people, "adm")).toEqual(["acc1", "acc2", "rep"]);
  });
  it("cancelled: placer, sales person and the shop", () => {
    expect(recipientIds("cancelled", people, "adm")).toEqual(["placer", "rep", "shop"]);
  });
  it("someone with two roles is told once", () => {
    const p = { ...people, accountsIds: ["rep", "acc1"], adminIds: ["acc1"] };
    expect(recipientIds("rate_edited", p, null)).toEqual(["rep", "acc1"]);
  });
  it("skips empty people and duplicates", () => {
    const p = { ...people, salesRepId: "placer", retailerUserId: null, logisticsIds: [] };
    expect(recipientIds("approved", p, null)).toEqual(["placer"]);
    expect(recipientIds("dispatched", p, null)).toEqual(["placer"]);
  });
  it("a retailer is never told about the rate", () => {
    const shopPlaced = { ...people, placedBy: "shop" };
    expect(recipientIds("rate_edited", shopPlaced, null)).not.toContain("shop");
  });
});

describe("buildNotifications", () => {
  const base = { retailerName: "Raju Stores", bags: 1, people, actorId: "placer" };
  it("names the event and has no price", () => {
    const list = buildNotifications({ ...base, event: "placed" });
    expect(list).toHaveLength(2);
    expect(list[0].title).toBe("New order");
    expect(list[0].body).toBe("Raju Stores, 1 bag placed.");
  });
  it("writes a message for every event", () => {
    for (const event of NOTIFICATION_EVENTS) {
      const list = buildNotifications({ ...base, event, bags: 10, actorId: null });
      expect(list.length).toBeGreaterThan(0);
      expect(list[0].type).toBe(event);
    }
  });
  it("rate changed message, without a price", () => {
    const r = buildNotifications({ ...base, event: "rate_edited", bags: 10, actorId: "log1" });
    expect(r.map((n) => n.userId)).toEqual(["acc1", "acc2", "rep", "adm"]);
    expect(r[0].title).toBe("Rate changed");
    expect(r[0].body).toBe("Raju Stores, 10 bags.");
  });
  it("rate changed with the rates: old → new and the reason, for staff", () => {
    const r = buildNotifications({
      ...base,
      event: "rate_edited",
      bags: 10,
      actorId: "log1",
      rate: { fromPaise: 35000, toPaise: 36050, reason: " price up " },
    });
    expect(r[0].body).toBe("Raju Stores, 10 bags: ₹350 → ₹360.50. Reason: price up.");
  });
  it("rate details never reach the shop's login, and other events ignore them", () => {
    const shopIsStaffToo = { ...people, accountsIds: ["shop"] };
    const rate = { fromPaise: 35000, toPaise: 36000, reason: "x" };
    const r = buildNotifications({ ...base, people: shopIsStaffToo, event: "rate_edited", bags: 10, actorId: null, rate });
    expect(r.find((n) => n.userId === "shop")?.body).toBe("Raju Stores, 10 bags.");
    const d = buildNotifications({ ...base, event: "dispatched", bags: 10, actorId: null, rate });
    for (const n of d) expect(n.body).not.toMatch(/₹/);
  });
  it("rateChangeText: a first rate has no 'before'", () => {
    expect(rateChangeText({ fromPaise: null, toPaise: 35000, reason: "" })).toBe("₹350");
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
    expect(list[0].body).toBe("Raju Stores, 20 bags are on the way.");
  });
  it("one bag is singular", () => {
    const list = buildNotifications({ ...base, event: "dispatched", bags: 1 });
    expect(list[0].body).toBe("Raju Stores, 1 bag is on the way.");
  });
  it("an old saved row of type rate_filled still opens its order", () => {
    // Rows saved before rate_filled was dropped keep their stored title/body; the list shows those as-is.
    const old = { type: "rate_filled", title: "Ready to approve", link: null, orderId: "o1" };
    expect(notificationTarget(old.link, old.orderId)).toBe("/orders/o1");
  });
});

describe("money notifications", () => {
  const people = { accountsIds: ["acc1", "acc2"], adminIds: ["adm1", "adm2"], collectorId: "col" };
  const base = {
    retailerName: "Raju Stores",
    amountPaise: 500000,
    people,
    actorId: "col",
  };

  it("online payment recorded and handover request go to every accounts person", () => {
    for (const event of ["online_recorded", "handover_requested"] as const) {
      expect(moneyRecipientIds(event, people, "col")).toEqual(["acc1", "acc2"]);
    }
  });
  it("a cash payment goes to every admin only (never accounts, the collector or a retailer)", () => {
    expect(moneyRecipientIds("cash_recorded", people, "col")).toEqual(["adm1", "adm2"]);
  });
  it("an admin who records cash is not told about it", () => {
    expect(moneyRecipientIds("cash_recorded", people, "adm1")).toEqual(["adm2"]);
    expect(moneyRecipientIds("cash_recorded", { ...people, adminIds: ["adm1"] }, "adm1")).toEqual([]);
  });
  it("cash recorded: shop name and amount, opens the payment", () => {
    expect(buildMoneyNotifications({ ...base, event: "cash_recorded", link: "/receipts/r9" })).toEqual([
      { userId: "adm1", type: "cash_recorded", title: "Cash payment", body: "₹5,000.00 cash from Raju Stores.", link: "/receipts/r9" },
      { userId: "adm2", type: "cash_recorded", title: "Cash payment", body: "₹5,000.00 cash from Raju Stores.", link: "/receipts/r9" },
    ]);
  });
  it("an accounts person who records a payment is not told about it", () => {
    expect(moneyRecipientIds("online_recorded", people, "acc1")).toEqual(["acc2"]);
  });
  it("verified, rejected, handover answers and reversal go to the staff member only", () => {
    for (const event of [
      "online_verified",
      "online_rejected",
      "handover_confirmed",
      "handover_rejected",
      "receipt_reversed",
    ] as const) {
      expect(moneyRecipientIds(event, people, "acc1")).toEqual(["col"]);
      expect(moneyRecipientIds(event, people, "col")).toEqual([]);
      expect(moneyRecipientIds(event, { ...people, collectorId: null }, "acc1")).toEqual([]);
    }
  });
  it("nobody is told twice", () => {
    expect(moneyRecipientIds("online_recorded", { accountsIds: ["a", "a", "b"], adminIds: [], collectorId: null }, null)).toEqual([
      "a",
      "b",
    ]);
  });

  it("online recorded: amount in rupees, opens the verify list", () => {
    expect(buildMoneyNotifications({ ...base, event: "online_recorded" })).toEqual([
      { userId: "acc1", type: "online_recorded", title: "Online payment to verify", body: "₹5,000.00 from Raju Stores.", link: "/receipts/review" },
      { userId: "acc2", type: "online_recorded", title: "Online payment to verify", body: "₹5,000.00 from Raju Stores.", link: "/receipts/review" },
    ]);
  });
  it("online verified and rejected (with the reason)", () => {
    const [ok] = buildMoneyNotifications({ ...base, event: "online_verified", actorId: "acc1" });
    expect(ok).toEqual({
      userId: "col",
      type: "online_verified",
      title: "Online payment verified",
      body: "₹5,000.00 from Raju Stores verified.",
      link: "/receipts",
    });
    const [no] = buildMoneyNotifications({ ...base, event: "online_rejected", actorId: "acc1", reason: "Not in bank" });
    expect(no).toMatchObject({ title: "Online payment rejected", body: "₹5,000.00 from Raju Stores rejected. Reason: Not in bank" });
  });
  it("handover request, confirmed, partly confirmed and rejected open the cash screen", () => {
    const [req] = buildMoneyNotifications({ ...base, event: "handover_requested", retailerName: null });
    expect(req).toMatchObject({ userId: "acc1", title: "Cash handover", body: "₹5,000.00 cash to confirm.", link: "/wallet" });
    const [ok] = buildMoneyNotifications({ ...base, event: "handover_confirmed", retailerName: null, actorId: "acc1", requestedPaise: 500000 });
    expect(ok).toMatchObject({ title: "Handover confirmed", body: "₹5,000.00 cash handover confirmed.", link: "/wallet" });
    const [part] = buildMoneyNotifications({ ...base, event: "handover_confirmed", actorId: "acc1", amountPaise: 300000, requestedPaise: 500000 });
    expect(part).toMatchObject({ title: "Handover partly confirmed", body: "₹3,000.00 of ₹5,000.00 received. The rest stays with you." });
    const [no] = buildMoneyNotifications({ ...base, event: "handover_rejected", actorId: "acc1", reason: " Count is short " });
    expect(no).toMatchObject({ title: "Handover rejected", body: "₹5,000.00 cash handover rejected. Reason: Count is short", link: "/wallet" });
  });
  it("payment reversed, with the caller's link and reason", () => {
    const [n] = buildMoneyNotifications({ ...base, event: "receipt_reversed", actorId: "acc1", link: "/receipts/r1", reason: "Wrong shop" });
    expect(n).toEqual({
      userId: "col",
      type: "receipt_reversed",
      title: "Payment reversed",
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
