import { describe, expect, it } from "vitest";
import { RECEIPT_STATUSES } from "./receipt-rules";
import { canReverseReceipt, isReversibleStatus, planReversal } from "./receipt-reversal";
import { walletBalance } from "./wallet-rules";

const cash = { mode: "cash", status: "received", receiptNo: 12, totalPaise: 10000 };
const holds = (balancePaise: number, availablePaise = balancePaise) => ({ balancePaise, availablePaise });

describe("reversible statuses", () => {
  it("received (cash) and verified (online) only", () => {
    expect(RECEIPT_STATUSES.filter((s) => isReversibleStatus(s))).toEqual(["received", "verified"]);
  });
  it("only accounts and admin may reverse", () => {
    expect(canReverseReceipt("accounts", "received")).toBe(true);
    expect(canReverseReceipt("admin", "verified")).toBe(true);
    for (const role of ["sales", "logistics", "retailer", null]) expect(canReverseReceipt(role, "received")).toBe(false);
    for (const status of ["unverified", "rejected", "reversed"]) expect(canReverseReceipt("accounts", status)).toBe(false);
  });
});

describe("planReversal", () => {
  it("cash still with the person: one +ledger amount and the same cash out of their balance", () => {
    expect(planReversal("accounts", cash, "wrong_amount", " typo ", "holder", holds(10000))).toEqual({
      ok: true,
      code: "wrong_amount",
      reason: "typo",
      ledgerKind: "receipt_reversal",
      ledgerPaise: 10000,
      walletPaise: 10000,
      note: "Payment #12 reversed: Wrong amount · typo",
    });
  });
  it("cash already handed to office: dues go back up, nobody's cash held changes", () => {
    expect(planReversal("accounts", cash, "wrong_amount", "", "office", holds(0))).toMatchObject({
      ok: true,
      ledgerPaise: 10000,
      walletPaise: 0,
    });
  });
  it("undoes the original credit exactly", () => {
    for (const place of ["holder", "office"]) {
      const p = planReversal("accounts", cash, "wrong_amount", "", place, holds(10000));
      expect(p.ok && -cash.totalPaise + p.ledgerPaise).toBe(0);
    }
  });
  it("needs a reason code from the payment list; a note only for Other", () => {
    expect(planReversal("accounts", cash, "", "", "holder", holds(10000))).toMatchObject({ ok: false, error: "Pick a reason" });
    expect(planReversal("accounts", cash, "no_stock", "", "holder", holds(10000))).toMatchObject({ ok: false, error: "Pick a reason" });
    expect(planReversal("accounts", cash, "other", " ", "holder", holds(10000))).toMatchObject({ ok: false, error: "Add a note" });
    expect(planReversal("accounts", cash, "wrong_shop", "", "holder", holds(10000))).toMatchObject({
      ok: true,
      code: "wrong_shop",
      reason: "",
      note: "Payment #12 reversed: Wrong shop",
    });
  });
  it("posts the receipt_reversal kind (+amount), never a + receipt_credit", () => {
    const p = planReversal("accounts", cash, "bounced", "", "office", holds(0));
    expect(p).toMatchObject({ ok: true, ledgerKind: "receipt_reversal", ledgerPaise: 10000 });
  });
  it("cash needs an answer: still with the person, or handed to office", () => {
    expect(planReversal("accounts", cash, "wrong_amount", "")).toMatchObject({ ok: false, error: "Pick where the cash is now." });
    expect(planReversal("accounts", cash, "wrong_amount", "", "bank", holds(10000)).ok).toBe(false);
  });
  it("still with the person, but they hold less: refused with how much they hold", () => {
    const p = planReversal("accounts", cash, "wrong_amount", "", "holder", holds(9999));
    expect(p).toMatchObject({ ok: false, error: expect.stringMatching(/They hold only ₹99\.99 now/) });
    expect(p).toMatchObject({ ok: false, error: expect.stringMatching(/Cash already handed to office/) });
    expect(planReversal("accounts", cash, "wrong_amount", "", "holder", holds(-500))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/₹0\.00/),
    });
  });
  it("the old 'ask admin for a ledger adjustment' answer is gone", () => {
    const p = planReversal("accounts", cash, "wrong_amount", "", "holder", holds(0));
    expect(p.ok).toBe(false);
    expect(!p.ok && p.error).not.toMatch(/adjustment/);
  });
  it("cash promised in a waiting handover request is refused until the request is answered", () => {
    const moves = [
      { id: "c", kind: "collected", amountPaise: 10000 },
      { id: "r", kind: "handover_request", amountPaise: 1000 },
    ];
    const p = planReversal("accounts", cash, "wrong_amount", "", "holder", walletBalance(moves));
    expect(p).toMatchObject({ ok: false, error: expect.stringMatching(/handover .* waiting/) });
    // Handed to office does not touch their balance, so a waiting request does not matter.
    expect(planReversal("accounts", cash, "wrong_amount", "", "office", walletBalance(moves)).ok).toBe(true);
  });
  it("after the reversal the holder has that much less", () => {
    const p = planReversal("accounts", cash, "wrong_amount", "", "holder", holds(10000));
    const after = walletBalance([
      { kind: "collected", amountPaise: 10000 },
      ...(p.ok ? [{ kind: "reversed", amountPaise: p.walletPaise }] : []),
    ]);
    expect(after.balancePaise).toBe(0);
  });
  it("verified online: ledger only, no cash, no cash question", () => {
    const p = planReversal("admin", { mode: "online", status: "verified", receiptNo: 1, totalPaise: 10000 }, "wrong_amount", "");
    expect(p).toMatchObject({ ok: true, ledgerPaise: 10000, walletPaise: 0 });
    const q = planReversal("admin", { mode: "online", status: "verified", receiptNo: 1, totalPaise: 10000 }, "wrong_amount", "", "holder");
    expect(q).toMatchObject({ ok: true, walletPaise: 0 });
  });
  it("unverified online is rejected, not reversed", () => {
    const p = planReversal("accounts", { mode: "online", status: "unverified", receiptNo: 1, totalPaise: 10000 }, "wrong_amount", "");
    expect(p).toMatchObject({ ok: false, error: expect.stringMatching(/Reject/) });
  });
  it("rejected and reversed are final; sales cannot reverse", () => {
    expect(planReversal("accounts", { ...cash, status: "reversed" }, "wrong_amount", "", "holder", holds(10000)).ok).toBe(false);
    expect(planReversal("accounts", { ...cash, mode: "online", status: "rejected" }, "wrong_amount", "").ok).toBe(false);
    expect(planReversal("sales", cash, "wrong_amount", "", "holder", holds(10000)).ok).toBe(false);
  });
});
