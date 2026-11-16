import { describe, expect, it } from "vitest";
import { activitySentence } from "./audit-rules";
import { BLOCKED_SHOP_TEXT, BLOCKED_SHOP_TITLE, isBlockedShop } from "./dispatch-rules";
import { buildBlockedDispatchNotifications } from "./notification-rules";

describe("blocked shop at dispatch", () => {
  it("only a blocked shop warns", () => {
    expect(isBlockedShop("blocked")).toBe(true);
    expect(isBlockedShop("hold")).toBe(false);
    expect(isBlockedShop("ok")).toBe(false);
    expect(isBlockedShop(null)).toBe(false);
    expect(isBlockedShop(undefined)).toBe(false);
  });

  it("the warning is plain and does not shout", () => {
    expect(BLOCKED_SHOP_TITLE).toBe("Shop is blocked");
    expect(BLOCKED_SHOP_TEXT).toBe("You can still dispatch. The owner will be told.");
    expect(BLOCKED_SHOP_TITLE + BLOCKED_SHOP_TEXT).not.toContain("!");
  });
});

describe("buildBlockedDispatchNotifications", () => {
  const base = {
    retailerName: " Singh Hardware ",
    bags: 60,
    actorName: "Demo Logistics",
    adminIds: ["a1"],
    accountsIds: ["c1", "c2"],
    salesRepId: "s1",
    actorId: "l1",
  };

  it("tells admins, accounts and the shop's sales person", () => {
    const drafts = buildBlockedDispatchNotifications(base);
    expect(drafts.map((d) => d.userId)).toEqual(["a1", "c1", "c2", "s1"]);
    expect(drafts[0]).toEqual({
      userId: "a1",
      type: "blocked_dispatch",
      title: "Dispatched to blocked shop",
      body: "Singh Hardware · 60 bags · by Demo Logistics",
      link: null,
    });
  });

  it("does not tell the person who dispatched, and nobody twice", () => {
    const drafts = buildBlockedDispatchNotifications({ ...base, adminIds: ["a1", "c1"], actorId: "a1" });
    expect(drafts.map((d) => d.userId)).toEqual(["c1", "c2", "s1"]);
  });

  it("copes with a shop that has no sales person, and one bag", () => {
    const drafts = buildBlockedDispatchNotifications({ ...base, salesRepId: null, bags: 1, actorName: "" });
    expect(drafts.map((d) => d.userId)).toEqual(["a1", "c1", "c2"]);
    expect(drafts[0].body).toBe("Singh Hardware · 1 bag");
  });
});

describe("activity log", () => {
  const names = new Map([
    ["u1", "Ramesh"],
    ["r1", "Sharma Traders"],
    ["p1", "Prism Trade OPC 43"],
  ]);
  const row = (details: Record<string, unknown>) => ({ actorId: "u1", entity: "dispatch", entityId: "x", action: "create", details });

  it("says when a load went to a blocked shop", () => {
    const d = { bags: 50, productId: "p1", retailerId: "r1", amountPaise: 1_750_000 };
    const plain = activitySentence(row(d), names);
    expect(activitySentence(row({ ...d, shopBlocked: true }), names)).toBe(`${plain} while the shop is blocked`);
    expect(plain).not.toContain("blocked");
  });
});
