import { describe, expect, it } from "vitest";
import { payableShops, planShopSwitch } from "./shop-off-rules";

describe("planShopSwitch", () => {
  it("turning on needs no reason", () => {
    expect(planShopSwitch({ makeActive: true, duesPaise: 5_00_000 })).toEqual({ ok: true, reason: null });
    expect(planShopSwitch({ makeActive: true, duesPaise: 0, code: "nonsense" })).toEqual({ ok: true, reason: null });
  });

  it("turning off a shop that owes nothing needs no reason", () => {
    expect(planShopSwitch({ makeActive: false, duesPaise: 0 })).toEqual({ ok: true, reason: null });
    expect(planShopSwitch({ makeActive: false, duesPaise: -2_000, code: "", note: "" })).toEqual({ ok: true, reason: null });
  });

  it("a reason given with no dues is still checked", () => {
    expect(planShopSwitch({ makeActive: false, duesPaise: 0, code: "moved", note: "  to  Pune " })).toEqual({
      ok: true,
      reason: { code: "moved", note: "to Pune" },
    });
    expect(planShopSwitch({ makeActive: false, duesPaise: 0, code: "rate_dispute" })).toEqual({ ok: false, error: "Pick a reason" });
  });

  it("turning off a shop that owes needs a reason from the shop_off list", () => {
    expect(planShopSwitch({ makeActive: false, duesPaise: 1 })).toEqual({ ok: false, error: "Pick a reason" });
    expect(planShopSwitch({ makeActive: false, duesPaise: 12_400_000, code: "no_stock" })).toEqual({
      ok: false,
      error: "Pick a reason",
    });
    expect(planShopSwitch({ makeActive: false, duesPaise: 12_400_000, code: 7 })).toEqual({ ok: false, error: "Pick a reason" });
    expect(planShopSwitch({ makeActive: false, duesPaise: 12_400_000, code: "bad_debt" })).toEqual({
      ok: true,
      reason: { code: "bad_debt", note: "" },
    });
  });

  it("Other needs a note, and the note stays short", () => {
    expect(planShopSwitch({ makeActive: false, duesPaise: 100, code: "other", note: " " })).toEqual({ ok: false, error: "Add a note" });
    expect(planShopSwitch({ makeActive: false, duesPaise: 100, code: "other", note: "x".repeat(201) })).toEqual({
      ok: false,
      error: "Keep the note under 200 characters",
    });
    expect(planShopSwitch({ makeActive: false, duesPaise: 100, code: "other", note: "owner died" })).toEqual({
      ok: true,
      reason: { code: "other", note: "owner died" },
    });
  });
});

describe("payableShops (the payment form's shop list)", () => {
  const shops = [
    { id: "on", active: true },
    { id: "on-advance", active: true },
    { id: "off-owes", active: false },
    { id: "off-clear", active: false },
    { id: "off-advance", active: false },
    { id: "off-no-ledger", active: false },
  ];
  const balances = new Map([
    ["on-advance", -500],
    ["off-owes", 12_400_000],
    ["off-clear", 0],
    ["off-advance", -100],
  ]);

  it("lists switched-on shops and switched-off shops that still owe, in the same order", () => {
    expect(payableShops(shops, balances).map((s) => s.id)).toEqual(["on", "on-advance", "off-owes"]);
  });

  it("with no ledger rows, only switched-on shops", () => {
    expect(payableShops(shops, new Map()).map((s) => s.id)).toEqual(["on", "on-advance"]);
  });
});
