import { describe, expect, it } from "vitest";
import {
  canChangeChequeStatus,
  checkReceiptAmount,
  MAX_RECEIPT_PAISE,
  RECEIPT_STATUSES,
  receiptChip,
  validateModeDetails,
} from "./receipt-rules";

describe("validateModeDetails", () => {
  it("cash needs nothing", () => expect(validateModeDetails("cash", {})).toBeNull());
  it("online needs a UTR", () => {
    expect(validateModeDetails("online", {})).toMatch(/UTR/);
    expect(validateModeDetails("online", { utr: "  " })).toMatch(/UTR/);
    expect(validateModeDetails("online", { utr: "X1" })).toBeNull();
  });
  it("cheque needs number, date, bank", () => {
    const ok = { chequeNumber: "123", chequeDate: "2026-10-01", bankName: "SBI" };
    expect(validateModeDetails("cheque", ok)).toBeNull();
    expect(validateModeDetails("cheque", { ...ok, chequeNumber: "" })).toMatch(/number/);
    expect(validateModeDetails("cheque", { ...ok, chequeDate: "01/10/2026" })).toMatch(/date/);
    expect(validateModeDetails("cheque", { ...ok, bankName: null })).toMatch(/bank name/);
  });
  it("rejects unknown mode", () => expect(validateModeDetails("upi", {})).not.toBeNull());
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

describe("cheque lifecycle", () => {
  it("pending can clear or bounce", () => {
    expect(canChangeChequeStatus("pending", "cleared")).toBe(true);
    expect(canChangeChequeStatus("pending", "bounced")).toBe(true);
  });
  it("final states and same-state cannot change", () => {
    expect(canChangeChequeStatus("pending", "pending")).toBe(false);
    for (const from of ["cleared", "bounced"] as const)
      for (const to of ["pending", "cleared", "bounced"] as const) expect(canChangeChequeStatus(from, to)).toBe(false);
  });
});

describe("receiptChip", () => {
  it("has a label for every status; bounced and reversed are red", () => {
    for (const s of RECEIPT_STATUSES) expect(receiptChip(s).label).not.toBe(s);
    expect(receiptChip("bounced").status).toBe("rejected");
    expect(receiptChip("reversed").status).toBe("rejected");
    expect(receiptChip("unverified").status).toBe("pending");
  });
});
