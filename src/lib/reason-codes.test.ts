import { describe, expect, it } from "vitest";
import {
  checkReason,
  isOrderEventReasonCode,
  isPaymentReasonCode,
  isReasonCode,
  isShopVisibleReason,
  isStockReasonCode,
  ORDER_EVENT_REASON_CODES,
  PAYMENT_REASON_CODES,
  REASON_LISTS,
  reasonHint,
  reasonLabel,
  reasonText,
  STOCK_REASON_CODES,
  type ReasonAction,
} from "./reason-codes";

const ACTIONS = Object.keys(REASON_LISTS) as ReasonAction[];
const codesOf = (a: ReasonAction) => REASON_LISTS[a].map((o) => o.code);
const labelsOf = (a: ReasonAction) => REASON_LISTS[a].map((o) => o.label);

describe("the lists", () => {
  it("are the agreed codes and labels, by how common", () => {
    expect(codesOf("reject")).toEqual(["rate_dispute", "no_stock", "duplicate", "over_credit", "shop_asked", "other"]);
    expect(labelsOf("reject")).toEqual(["Rate dispute", "Out of stock", "Duplicate", "Over limit", "Shop asked", "Other"]);
    expect(codesOf("cancel")).toEqual(["shop_asked", "no_stock", "entry_mistake", "duplicate", "truck_issue", "other"]);
    expect(labelsOf("cancel")).toEqual(["Shop asked", "Out of stock", "Wrong entry", "Duplicate", "Truck issue", "Other"]);
    expect(codesOf("rate_change")).toEqual(["rate_dispute", "entry_mistake", "price_revision", "owner_said", "other"]);
    expect(labelsOf("rate_change")).toEqual(["Rate dispute", "Wrong entry", "Market change", "Owner said", "Other"]);
    expect(codesOf("override")).toEqual(["payment_promised", "old_customer", "owner_said", "cash_on_delivery", "other"]);
    expect(labelsOf("override")).toEqual(["Payment promised", "Old customer", "Owner said yes", "Cash on delivery", "Other"]);
    expect(codesOf("payment")).toEqual(["wrong_shop", "wrong_amount", "duplicate", "not_in_bank", "bounced", "other"]);
    expect(labelsOf("payment")).toEqual(["Wrong shop", "Wrong amount", "Duplicate", "Not received", "Bounced", "Other"]);
    expect(codesOf("stock")).toEqual(["transit_short", "transit_burst", "damage", "entry_mistake", "expired", "other"]);
    expect(labelsOf("stock")).toEqual(["Transit short", "Transit burst", "Damaged", "Wrong entry", "Expired", "Other"]);
  });
  it("each has at most 6 chips, Other last, labels of 3 words at most, no repeats", () => {
    for (const a of ACTIONS) {
      const codes = codesOf(a);
      expect(codes.length).toBeLessThanOrEqual(6);
      expect(codes.at(-1)).toBe("other");
      expect(new Set(codes).size).toBe(codes.length);
      for (const l of labelsOf(a)) expect(l.split(" ").length).toBeLessThanOrEqual(3);
      // Plain words only: they go straight into the database CHECK rules.
      for (const c of codes) expect(c).toMatch(/^[a-z_]+$/);
    }
  });
  it("the order history codes are reject + cancel + rate change + override, once each", () => {
    const union = new Set([...codesOf("reject"), ...codesOf("cancel"), ...codesOf("rate_change"), ...codesOf("override")]);
    expect(new Set(ORDER_EVENT_REASON_CODES)).toEqual(union);
    expect(ORDER_EVENT_REASON_CODES.length).toBe(union.size);
    expect(isOrderEventReasonCode("cash_on_delivery")).toBe(true);
    expect(isOrderEventReasonCode("bounced")).toBe(false);
  });
  it("payment and stock code lists match their pickers", () => {
    expect(PAYMENT_REASON_CODES).toEqual(codesOf("payment"));
    expect(STOCK_REASON_CODES).toEqual(codesOf("stock"));
    expect(isPaymentReasonCode("not_in_bank")).toBe(true);
    expect(isPaymentReasonCode("damage")).toBe(false);
    expect(isStockReasonCode("expired")).toBe(true);
    expect(isStockReasonCode("count")).toBe(false);
    expect(isReasonCode("cancel", "truck_issue")).toBe(true);
    expect(isReasonCode("reject", "truck_issue")).toBe(false);
    expect(isReasonCode("reject", 3)).toBe(false);
  });
});

describe("labels", () => {
  it("reads the label of a code, or nothing", () => {
    expect(reasonLabel("no_stock")).toBe("Out of stock");
    expect(reasonLabel("owner_said")).toBe("Owner said");
    expect(reasonLabel("owner_said", "override")).toBe("Owner said yes");
    expect(reasonLabel(null)).toBe("");
    expect(reasonLabel("nonsense")).toBe("");
  });
  it("joins label and note", () => {
    expect(reasonText("bounced", " cheque ", "payment")).toBe("Bounced · cheque");
    expect(reasonText("bounced", "", "payment")).toBe("Bounced");
    expect(reasonText(null, "old free text")).toBe("old free text");
  });
});

describe("checkReason", () => {
  it("needs a code from that action's list", () => {
    for (const a of ACTIONS) {
      expect(checkReason(a, null, "x")).toEqual({ ok: false, error: "Pick a reason" });
      expect(checkReason(a, "", "x")).toEqual({ ok: false, error: "Pick a reason" });
      expect(checkReason(a, "made_up", "x")).toEqual({ ok: false, error: "Pick a reason" });
      for (const code of codesOf(a).filter((c) => c !== "other")) {
        expect(checkReason(a, code, "")).toEqual({ ok: true, code, note: "" });
      }
    }
    expect(checkReason("payment", "truck_issue", "")).toEqual({ ok: false, error: "Pick a reason" });
  });
  it("Other needs a note", () => {
    for (const a of ACTIONS) {
      expect(checkReason(a, "other", "")).toEqual({ ok: false, error: "Add a note" });
      expect(checkReason(a, "other", "   ")).toEqual({ ok: false, error: "Add a note" });
      expect(checkReason(a, "other", null)).toEqual({ ok: false, error: "Add a note" });
      expect(checkReason(a, "other", "moved")).toEqual({ ok: true, code: "other", note: "moved" });
    }
  });
  it("trims the note, collapses spaces, and allows 200 characters at most", () => {
    expect(checkReason("reject", "duplicate", "  same\n\n  order  ")).toMatchObject({ ok: true, note: "same order" });
    expect(checkReason("stock", "damage", "x".repeat(200))).toMatchObject({ ok: true });
    expect(checkReason("stock", "damage", "x".repeat(201))).toEqual({ ok: false, error: "Keep the note under 200 characters" });
    // Counted after trimming.
    expect(checkReason("stock", "damage", `  ${"x".repeat(200)}  `)).toMatchObject({ ok: true });
    expect(checkReason("stock", "damage", 42)).toEqual({ ok: true, code: "damage", note: "" });
  });
  it("reasonHint says what is still missing", () => {
    expect(reasonHint("cancel", null, "")).toBe("Pick a reason");
    expect(reasonHint("cancel", "other", "")).toBe("Add a note");
    expect(reasonHint("cancel", "shop_asked", "")).toBeNull();
  });
});

describe("isShopVisibleReason", () => {
  it("only these codes are shown to a shop", () => {
    const all = [...new Set(ACTIONS.flatMap(codesOf))];
    expect(all.filter(isShopVisibleReason).sort()).toEqual(["duplicate", "entry_mistake", "no_stock", "shop_asked", "truck_issue"]);
  });
  it("money, owner and override codes, and Other, are staff only", () => {
    for (const c of ["over_credit", "rate_dispute", "price_revision", "owner_said", "other", ...codesOf("override")]) {
      expect(isShopVisibleReason(c)).toBe(false);
    }
    expect(isShopVisibleReason(null)).toBe(false);
    expect(isShopVisibleReason("")).toBe(false);
  });
});
