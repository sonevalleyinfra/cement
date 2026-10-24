import { describe, expect, it } from "vitest";
import {
  checkReason,
  checkReceiptAmount,
  isUtrTaken,
  MAX_RECEIPT_PAISE,
  normaliseUtr,
  PAYMENT_MODES,
  planReceipt,
  planReject,
  planVerify,
  RECEIPT_STATUSES,
  receiptChip,
  validateModeDetails,
  UTR_FREED_STATUSES,
  type ReceiptRequest,
} from "./receipt-rules";

describe("modes and statuses", () => {
  it("has two modes only: cash and online", () => expect(PAYMENT_MODES).toEqual(["cash", "online"]));
  it("has no cheque statuses", () => {
    expect(RECEIPT_STATUSES).toEqual(["received", "unverified", "verified", "rejected", "reversed"]);
  });
});

describe("validateModeDetails", () => {
  it("cash needs nothing", () => expect(validateModeDetails("cash", {})).toBeNull());
  it("online needs a UTR", () => {
    expect(validateModeDetails("online", {})).toMatch(/UTR/);
    expect(validateModeDetails("online", { utr: "  " })).toMatch(/UTR/);
    expect(validateModeDetails("online", { utr: "X1" })).toBeNull();
    expect(validateModeDetails("online", { utr: "1".repeat(41) })).toMatch(/too long/);
  });
  it("refuses cheque and unknown modes", () => {
    expect(validateModeDetails("cheque", {})).not.toBeNull();
    expect(validateModeDetails("upi", {})).not.toBeNull();
  });
});

describe("checkReceiptAmount", () => {
  it("accepts whole paise above zero", () => {
    expect(checkReceiptAmount(1)).toBeNull();
    expect(checkReceiptAmount(500000)).toBeNull();
    expect(checkReceiptAmount(MAX_RECEIPT_PAISE)).toBeNull();
  });
  it("refuses zero, negative, fractions and huge amounts", () => {
    for (const n of [0, -100, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) expect(checkReceiptAmount(n)).not.toBeNull();
    expect(checkReceiptAmount(MAX_RECEIPT_PAISE + 1)).toMatch(/too large/);
  });
});

describe("checkReason", () => {
  it("needs some words, trims them, and caps the length", () => {
    expect(checkReason("  Wrong shop ")).toEqual({ ok: true, reason: "Wrong shop" });
    expect(checkReason("   ").ok).toBe(false);
    expect(checkReason(undefined).ok).toBe(false);
    expect(checkReason("x".repeat(301)).ok).toBe(false);
  });
});

describe("UTR", () => {
  it("is stored without spaces and in capitals", () => expect(normaliseUtr(" a b\tc ")).toBe("ABC"));

  const existing = [
    { mode: "online", status: "verified", utr: "UTR1" },
    { mode: "online", status: "unverified", utr: "UTR2" },
    { mode: "online", status: "reversed", utr: "UTR3" },
    { mode: "online", status: "rejected", utr: "UTR4" },
    { mode: "cash", status: "received", utr: null },
  ];
  it("cannot be recorded twice (any case or spacing)", () => {
    expect(isUtrTaken("utr1", existing)).toBe(true);
    expect(isUtrTaken(" U T R 2 ", existing)).toBe(true);
  });
  it("a rejected payment frees its UTR", () => expect(isUtrTaken("UTR4", existing)).toBe(false));
  it("a reversed payment frees its UTR too", () => expect(isUtrTaken("utr3", existing)).toBe(false));
  it("UTR_FREED_STATUSES are exactly rejected and reversed", () => expect(UTR_FREED_STATUSES).toEqual(["rejected", "reversed"]));
  it("a new UTR is free", () => {
    expect(isUtrTaken("UTR9", existing)).toBe(false);
    expect(isUtrTaken("", existing)).toBe(false);
  });
});

describe("planReceipt", () => {
  const base: ReceiptRequest = { retailerId: "R", mode: "cash", totalPaise: 10000000 };

  it("cash is received: the dues go down now and the recorder holds the cash", () => {
    expect(planReceipt(base)).toEqual({
      ok: true,
      status: "received",
      utr: null,
      note: "",
      ledger: { retailerId: "R", kind: "receipt_credit", amountPaise: -10000000 },
      walletPaise: 10000000,
    });
  });
  it("cash ignores a UTR", () => {
    const p = planReceipt({ ...base, utr: "X" });
    expect(p.ok && p.utr).toBeNull();
  });
  it("online is unverified: no ledger change, no cash held, UTR stored cleanly with the note", () => {
    expect(planReceipt({ ...base, mode: "online", utr: " ab 12 ", note: " paid by son " })).toEqual({
      ok: true,
      status: "unverified",
      utr: "AB12",
      note: "paid by son",
      ledger: null,
      walletPaise: 0,
    });
  });
  it("online needs a UTR", () => expect(planReceipt({ ...base, mode: "online" }).ok).toBe(false));
  it("refuses a bad amount, cheques and unknown modes", () => {
    for (const totalPaise of [0, -5, 1.5]) expect(planReceipt({ ...base, totalPaise }).ok).toBe(false);
    expect(planReceipt({ ...base, mode: "cheque" }).ok).toBe(false);
    expect(planReceipt({ ...base, mode: "upi" }).ok).toBe(false);
  });
  it("refuses a very long note", () => expect(planReceipt({ ...base, note: "x".repeat(301) }).ok).toBe(false));
});

describe("planVerify", () => {
  const online = { mode: "online", status: "unverified", retailerId: "R", totalPaise: 5000 };

  it("accounts or admin verify: the credit is posted now", () => {
    for (const role of ["accounts", "admin", "sales,accounts"]) {
      expect(planVerify(role, online)).toEqual({
        ok: true,
        ledger: { retailerId: "R", kind: "receipt_credit", amountPaise: -5000 },
      });
    }
  });
  it("refuses sales, logistics, retailers and no role", () => {
    for (const role of ["sales", "logistics", "retailer", null]) expect(planVerify(role, online).ok).toBe(false);
  });
  it("only an unverified online payment, only once", () => {
    for (const status of ["verified", "rejected", "reversed"]) expect(planVerify("accounts", { ...online, status }).ok).toBe(false);
    expect(planVerify("accounts", { ...online, mode: "cash", status: "received" }).ok).toBe(false);
  });
});

describe("planReject", () => {
  const online = { mode: "online", status: "unverified" };
  it("needs a reason code from the payment list", () => {
    expect(planReject("accounts", online, "not_in_bank", " Not in  statement ")).toEqual({
      ok: true,
      code: "not_in_bank",
      note: "Not in statement",
    });
    expect(planReject("accounts", online, "wrong_amount", "")).toEqual({ ok: true, code: "wrong_amount", note: "" });
    expect(planReject("accounts", online, null, "Not in statement")).toEqual({ ok: false, error: "Pick a reason" });
    expect(planReject("accounts", online, "rate_dispute", "")).toEqual({ ok: false, error: "Pick a reason" });
    expect(planReject("accounts", online, "other", " ")).toEqual({ ok: false, error: "Add a note" });
  });
  it("only accounts or admin, only unverified online", () => {
    expect(planReject("sales", online, "bounced", "").ok).toBe(false);
    expect(planReject("accounts", { ...online, status: "verified" }, "bounced", "").ok).toBe(false);
    expect(planReject("accounts", { mode: "cash", status: "received" }, "bounced", "").ok).toBe(false);
  });
});

describe("receiptChip", () => {
  it("has a label for every status", () => {
    for (const s of RECEIPT_STATUSES) expect(receiptChip(s).label).not.toBe(s);
  });
  it("rejected is red, reversed grey, unverified waiting", () => {
    expect(receiptChip("received").label).toBe("Cash recorded");
    expect(receiptChip("rejected").status).toBe("rejected");
    expect(receiptChip("reversed").status).toBe("cancelled");
    expect(receiptChip("unverified").status).toBe("placed");
    expect(receiptChip("verified").status).toBe("approved");
  });
});
