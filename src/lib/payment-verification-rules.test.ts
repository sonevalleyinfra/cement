import { describe, expect, it } from "vitest";
import { checkOnlineVerification, normaliseUtr, planChequeAction } from "./payment-verification-rules";
import { firmLines } from "./receipt-rules";

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
  const lines = firmLines([
    { firmId: "A", amountPaise: 6000000 },
    { firmId: "A", amountPaise: 1000000 },
    { firmId: "B", amountPaise: 4000000 },
  ]);
  const pending = { mode: "cheque", status: "pending" };

  it("clearing posts nothing", () => {
    expect(planChequeAction("accounts", pending, "cleared", lines)).toEqual({ ok: true, status: "cleared", ledgerLines: [] });
  });
  it("bounce posts a compensating line per firm that nets to zero against the credits", () => {
    const p = planChequeAction("accounts", pending, "bounced", lines);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.ledgerLines).toEqual([
      { firmId: "A", amountPaise: 7000000 },
      { firmId: "B", amountPaise: 4000000 },
    ]);
    const credits = lines.map((l) => -l.amountPaise);
    const total = [...credits, ...p.ledgerLines.map((l) => l.amountPaise)].reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });
  it("a bounced or cleared cheque cannot change again", () => {
    expect(planChequeAction("accounts", { mode: "cheque", status: "bounced" }, "cleared", lines).ok).toBe(false);
    expect(planChequeAction("accounts", { mode: "cheque", status: "cleared" }, "bounced", lines).ok).toBe(false);
  });
  it("only accounts or admin, only cheques, only cleared/bounced", () => {
    expect(planChequeAction("sales", pending, "cleared", lines).ok).toBe(false);
    expect(planChequeAction("accounts", { mode: "cash", status: "received" }, "cleared", lines).ok).toBe(false);
    expect(planChequeAction("accounts", pending, "pending", lines).ok).toBe(false);
  });
});
