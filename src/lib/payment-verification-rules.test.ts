import { describe, expect, it } from "vitest";
import { checkOnlineVerification, normaliseUtr, planChequeAction } from "./payment-verification-rules";

const online = { mode: "online", status: "unverified", utr: "abc 123" };

describe("checkOnlineVerification", () => {
  it("accepts a matching UTR from accounts or admin", () => {
    expect(checkOnlineVerification("accounts", online, " ABC123 ").ok).toBe(true);
    expect(checkOnlineVerification("admin", online, "abc123").ok).toBe(true);
  });
  it("refuses sales, logistics and retailers", () => {
    for (const role of ["sales", "logistics", "retailer", null]) {
      expect(checkOnlineVerification(role, online, "abc123").ok).toBe(false);
    }
  });
  it("refuses a wrong or empty UTR", () => {
    expect(checkOnlineVerification("accounts", online, "zzz").ok).toBe(false);
    expect(checkOnlineVerification("accounts", online, "  ").ok).toBe(false);
  });
  it("refuses already verified and non-online receipts", () => {
    expect(checkOnlineVerification("accounts", { ...online, status: "verified" }, "abc123").ok).toBe(false);
    expect(checkOnlineVerification("accounts", { ...online, mode: "cash" }, "abc123").ok).toBe(false);
  });
  it("normalises UTRs", () => expect(normaliseUtr(" a b\tc ")).toBe("ABC"));
});

describe("planChequeAction", () => {
  const pending = { mode: "cheque", status: "pending", totalPaise: 11000000 };

  it("clearing posts nothing", () => {
    expect(planChequeAction("accounts", pending, "cleared")).toEqual({ ok: true, status: "cleared", ledgerPaise: 0 });
  });
  it("bounce posts one compensating amount that nets to zero against the credit", () => {
    const p = planChequeAction("accounts", pending, "bounced");
    expect(p).toEqual({ ok: true, status: "bounced", ledgerPaise: 11000000 });
    expect(p.ok && -pending.totalPaise + p.ledgerPaise).toBe(0);
  });
  it("a bounced or cleared cheque cannot change again", () => {
    expect(planChequeAction("accounts", { ...pending, status: "bounced" }, "cleared").ok).toBe(false);
    expect(planChequeAction("accounts", { ...pending, status: "cleared" }, "bounced").ok).toBe(false);
  });
  it("only accounts or admin, only cheques, only cleared/bounced", () => {
    expect(planChequeAction("sales", pending, "cleared").ok).toBe(false);
    expect(planChequeAction("accounts", { mode: "cash", status: "received", totalPaise: 1 }, "cleared").ok).toBe(false);
    expect(planChequeAction("accounts", pending, "pending").ok).toBe(false);
  });
});
