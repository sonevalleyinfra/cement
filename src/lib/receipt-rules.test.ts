import { describe, expect, it } from "vitest";
import {
  checkReason,
  checkReceiptAmount,
  isUtrTaken,
  MAX_RECEIPT_PAISE,
  normaliseUtr,
  PAYMENT_MODES,
  checkReceivedOn,
  earliestReceivedOn,
  ONLINE_METHODS,
  paymentMoment,
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
  const TODAY = "2026-10-24";
  const ACCOUNT = "0b7c6f1e-2a3d-4c5b-8e9f-1a2b3c4d5e6f";
  const base: ReceiptRequest = { retailerId: "R", mode: "cash", totalPaise: 10000000, role: "sales", today: TODAY, receivedOn: TODAY };
  const online: ReceiptRequest = { ...base, mode: "online", utr: "U1", onlineMethod: "upi", bankAccountId: ACCOUNT };

  it("cash is received: the dues go down now and the recorder holds the cash", () => {
    expect(planReceipt(base)).toEqual({
      ok: true,
      status: "received",
      utr: null,
      note: "",
      onlineMethod: null,
      bankAccountId: null,
      payerName: "",
      proofImage: null,
      chequeDate: null,
      chequeBank: null,
      receivedOn: TODAY,
      backdate: null,
      ledger: { retailerId: "R", kind: "receipt_credit", amountPaise: -10000000 },
      walletPaise: 10000000,
    });
  });
  it("cash ignores a UTR", () => {
    const p = planReceipt({ ...base, utr: "X" });
    expect(p.ok && p.utr).toBeNull();
  });
  it("cash keeps its note and drops the online fields", () => {
    const p = planReceipt({ ...base, note: " left at shop ", onlineMethod: "neft", bankAccountId: ACCOUNT, payerName: "Son" });
    expect(p).toMatchObject({ ok: true, note: "left at shop", onlineMethod: null, bankAccountId: null, payerName: "" });
  });
  it("online is unverified: no ledger change, no cash held, UTR stored cleanly with the note and details", () => {
    expect(planReceipt({ ...online, utr: " ab 12 ", note: " paid by son ", payerName: "  Ravi   Kumar " })).toEqual({
      ok: true,
      status: "unverified",
      utr: "AB12",
      note: "paid by son",
      onlineMethod: "upi",
      bankAccountId: ACCOUNT,
      payerName: "Ravi Kumar",
      proofImage: null,
      chequeDate: null,
      chequeBank: null,
      receivedOn: TODAY,
      backdate: null,
      ledger: null,
      walletPaise: 0,
    });
  });
  it("online needs a UTR", () => expect(planReceipt({ ...online, utr: "" }).ok).toBe(false));
  it("online needs a method and the account it came into", () => {
    expect(planReceipt({ ...online, onlineMethod: undefined })).toEqual({ ok: false, error: "Pick UPI, NEFT, RTGS, IMPS or Cheque." });
    expect(planReceipt({ ...online, onlineMethod: "cheque" }).ok).toBe(true);
    expect(planReceipt({ ...online, bankAccountId: null })).toEqual({ ok: false, error: "Pick the account it came into." });
    expect(planReceipt({ ...online, bankAccountId: "sbi" })).toEqual({ ok: false, error: "Pick the account it came into." });
    for (const m of ONLINE_METHODS) expect(planReceipt({ ...online, onlineMethod: m }).ok).toBe(true);
  });
  it("the payer name is optional, 80 characters at most", () => {
    expect(planReceipt({ ...online, payerName: "x".repeat(80) }).ok).toBe(true);
    expect(planReceipt({ ...online, payerName: "x".repeat(81) })).toEqual({
      ok: false,
      error: "Keep the payer name under 80 characters.",
    });
  });
  it("refuses a bad amount, cheques and unknown modes", () => {
    for (const totalPaise of [0, -5, 1.5]) expect(planReceipt({ ...base, totalPaise }).ok).toBe(false);
    expect(planReceipt({ ...base, mode: "cheque" }).ok).toBe(false);
    expect(planReceipt({ ...base, mode: "upi" }).ok).toBe(false);
  });
  it("refuses a very long note", () => expect(planReceipt({ ...base, note: "x".repeat(301) }).ok).toBe(false));
  it("checks the received day and keeps an admin's backdate reason", () => {
    expect(planReceipt({ ...base, receivedOn: "2026-10-21" })).toEqual({ ok: false, error: "Pick today or up to 2 days back." });
    expect(planReceipt({ ...base, receivedOn: undefined })).toEqual({ ok: false, error: "Pick a date." });
    const p = planReceipt({ ...base, role: "admin", receivedOn: "2026-10-14", backdateReasonCode: "late_entry", backdateNote: " " });
    expect(p).toMatchObject({ ok: true, receivedOn: "2026-10-14", backdate: { code: "late_entry", note: "" } });
  });
});

describe("checkReceivedOn", () => {
  const TODAY = "2026-10-24";

  it("staff may pick today or up to 2 days back", () => {
    for (const day of ["2026-10-24", "2026-10-23", "2026-10-22"]) {
      expect(checkReceivedOn("sales", day, TODAY)).toEqual({ ok: true, receivedOn: day, backdate: null });
    }
    expect(earliestReceivedOn(TODAY)).toBe("2026-10-22");
  });
  it("staff cannot go 3 days back, even with a reason", () => {
    expect(checkReceivedOn("accounts", "2026-10-21", TODAY, { code: "late_entry" })).toEqual({
      ok: false,
      error: "Pick today or up to 2 days back.",
    });
  });
  it("nobody may pick a future day", () => {
    for (const role of ["sales", "admin"]) {
      expect(checkReceivedOn(role, "2026-10-25", TODAY, { code: "late_entry" })).toEqual({
        ok: false,
        error: "The date cannot be in the future.",
      });
    }
  });
  it("admin 3 days back needs a reason", () => {
    expect(checkReceivedOn("admin", "2026-10-21", TODAY)).toEqual({ ok: false, error: "Pick a reason for the older date." });
    expect(checkReceivedOn("admin", "2026-10-21", TODAY, { code: "bounced" })).toEqual({
      ok: false,
      error: "Pick a reason for the older date.",
    });
    expect(checkReceivedOn("admin", "2026-10-21", TODAY, { code: "bank_delay", note: " slow  bank " })).toEqual({
      ok: true,
      receivedOn: "2026-10-21",
      backdate: { code: "bank_delay", note: "slow bank" },
    });
    expect(checkReceivedOn("sales,admin", "2025-01-01", TODAY, { code: "owner_said" }).ok).toBe(true);
  });
  it("admin with Other needs a note", () => {
    expect(checkReceivedOn("admin", "2026-10-21", TODAY, { code: "other", note: "" })).toEqual({ ok: false, error: "Add a note" });
    expect(checkReceivedOn("admin", "2026-10-21", TODAY, { code: "other", note: "found later" })).toMatchObject({ ok: true });
  });
  it("admin 2 days back needs no reason (a reason sent is ignored)", () => {
    expect(checkReceivedOn("admin", "2026-10-22", TODAY, { code: "late_entry" })).toEqual({
      ok: true,
      receivedOn: "2026-10-22",
      backdate: null,
    });
  });
  it("refuses missing and bad dates", () => {
    expect(checkReceivedOn("sales", "", TODAY)).toEqual({ ok: false, error: "Pick a date." });
    expect(checkReceivedOn("sales", undefined, TODAY)).toEqual({ ok: false, error: "Pick a date." });
    expect(checkReceivedOn("sales", "24-10-2026", TODAY)).toEqual({ ok: false, error: "Pick a date." });
    expect(checkReceivedOn("admin", "2026-02-30", TODAY)).toEqual({ ok: false, error: "Pick a real date." });
    expect(checkReceivedOn("admin", "1999-12-31", TODAY)).toEqual({ ok: false, error: "Pick a real date." });
  });
  it("crosses a month end", () => {
    expect(checkReceivedOn("sales", "2026-10-30", "2026-11-01").ok).toBe(true);
    expect(checkReceivedOn("sales", "2026-10-29", "2026-11-01").ok).toBe(false);
  });
});

describe("paymentMoment", () => {
  it("a payment received on the day it was saved counts when it was saved", () => {
    const at = new Date("2026-10-24T06:00:00Z");
    expect(paymentMoment("2026-10-24", at)).toBe(at);
  });
  it("an earlier received day counts at the last millisecond of that day in India", () => {
    expect(paymentMoment("2026-10-22", new Date("2026-10-24T06:00:00Z")).toISOString()).toBe("2026-10-22T18:29:59.999Z");
  });
  it("uses the India day of the save, not the UTC day", () => {
    // 18:40 UTC on 24 Oct is 00:10 on 25 Oct in India: a payment received on 24 Oct is backdated by one day.
    const late = new Date("2026-10-24T18:40:00Z");
    expect(paymentMoment("2026-10-24", late).toISOString()).toBe("2026-10-24T18:29:59.999Z");
    expect(paymentMoment("2026-10-25", late)).toBe(late);
    // 18:20 UTC on 24 Oct is still 24 Oct in India (23:50).
    const before = new Date("2026-10-24T18:20:00Z");
    expect(paymentMoment("2026-10-24", before)).toBe(before);
  });
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
