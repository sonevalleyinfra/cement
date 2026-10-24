import { describe, expect, it } from "vitest";
import {
  CREDIT_LIMIT_MAX_PAISE,
  creditChange,
  creditChangeParts,
  creditLimitText,
  DEFAULT_CREDIT_DAYS,
  effectiveCreditDays,
  parseCreditLimit,
  validateCredit,
  validateCreditDays,
} from "./credit-rules";

describe("parseCreditLimit", () => {
  it("empty = no limit", () => {
    expect(parseCreditLimit("")).toEqual({ ok: true, value: null });
    expect(parseCreditLimit("   ")).toEqual({ ok: true, value: null });
  });
  it("rupees to paise, with commas and paise", () => {
    expect(parseCreditLimit("2,00,000")).toEqual({ ok: true, value: 20_000_000 });
    expect(parseCreditLimit("₹ 500.5")).toEqual({ ok: true, value: 50_050 });
    expect(parseCreditLimit("0")).toEqual({ ok: true, value: 0 });
  });
  it("refuses negative, more than 2 decimals and text", () => {
    expect(parseCreditLimit("-100")).toEqual({ ok: false, error: "Limit can't be negative" });
    expect(parseCreditLimit("10.555")).toEqual({ ok: false, error: "Enter the limit in rupees" });
    expect(parseCreditLimit("ten")).toEqual({ ok: false, error: "Enter the limit in rupees" });
  });
  it("caps at ₹10 crore", () => {
    expect(CREDIT_LIMIT_MAX_PAISE).toBe(10_000_000_000);
    expect(Number.isSafeInteger(CREDIT_LIMIT_MAX_PAISE)).toBe(true);
    expect(parseCreditLimit("10,00,00,000")).toEqual({ ok: true, value: CREDIT_LIMIT_MAX_PAISE });
    expect(parseCreditLimit("10,00,00,000.01")).toEqual({ ok: false, error: "Limit is over ₹10 crore" });
  });
});

describe("creditLimitText", () => {
  it("shows paise only when there are any", () => {
    expect(creditLimitText(null)).toBe("");
    expect(creditLimitText(20_000_000)).toBe("200000");
    expect(creditLimitText(200_050)).toBe("2000.50");
    expect(creditLimitText(205)).toBe("2.05");
  });
  it("round-trips through parseCreditLimit", () => {
    for (const p of [0, 1, 99, 100, 200_050, CREDIT_LIMIT_MAX_PAISE]) {
      expect(parseCreditLimit(creditLimitText(p))).toEqual({ ok: true, value: p });
    }
  });
});

describe("validateCreditDays", () => {
  it("empty = not set", () => expect(validateCreditDays(" ")).toEqual({ ok: true, value: null }));
  it("0 to 365", () => {
    expect(validateCreditDays("0")).toEqual({ ok: true, value: 0 });
    expect(validateCreditDays("45")).toEqual({ ok: true, value: 45 });
    expect(validateCreditDays("365")).toEqual({ ok: true, value: 365 });
    expect(validateCreditDays("366")).toEqual({ ok: false, error: "Credit days must be 0 to 365" });
  });
  it("whole days only", () => {
    for (const t of ["30.5", "-1", "1e2", "abc"]) {
      expect(validateCreditDays(t)).toEqual({ ok: false, error: "Enter whole credit days" });
    }
  });
});

describe("effectiveCreditDays", () => {
  it("defaults to 30", () => {
    expect(DEFAULT_CREDIT_DAYS).toBe(30);
    expect(effectiveCreditDays(null)).toBe(30);
    expect(effectiveCreditDays(undefined)).toBe(30);
  });
  it("keeps the shop's own days, 0 too", () => {
    expect(effectiveCreditDays(45)).toBe(45);
    expect(effectiveCreditDays(0)).toBe(0);
  });
});

describe("validateCredit", () => {
  it("cleans every part", () => {
    expect(validateCredit({ limit: "5,00,000", days: "45", status: "hold", note: "  late   payer " })).toEqual({
      ok: true,
      value: { limitPaise: 50_000_000, creditDays: 45, status: "hold", note: "late payer" },
    });
  });
  it("refuses a bad status, limit, days or a long note", () => {
    expect(validateCredit({ limit: "", days: "", status: "frozen", note: "" })).toEqual({
      ok: false,
      error: "Pick a credit status",
    });
    expect(validateCredit({ limit: "-1", days: "", status: "ok", note: "" }).ok).toBe(false);
    expect(validateCredit({ limit: "", days: "400", status: "ok", note: "" }).ok).toBe(false);
    expect(validateCredit({ limit: "", days: "", status: "ok", note: "a".repeat(201) })).toEqual({
      ok: false,
      error: "Note is too long",
    });
    expect(validateCredit({ limit: "", days: "", status: "ok", note: "a".repeat(200) }).ok).toBe(true);
  });
});

describe("creditChange", () => {
  const base = { limitPaise: null, creditDays: null, status: "ok" as const };
  it("null when nothing changed (null → null too)", () => {
    expect(creditChange(base, { ...base })).toBeNull();
    const set = { limitPaise: 100, creditDays: 30, status: "hold" as const };
    expect(creditChange(set, { ...set }, "note")).toBeNull();
  });
  it("null → 30 days IS a change", () => {
    expect(creditChange(base, { ...base, creditDays: 30 })).toEqual({
      oldLimitPaise: null,
      newLimitPaise: null,
      oldCreditDays: null,
      newCreditDays: 30,
      oldStatus: "ok",
      newStatus: "ok",
      note: "",
    });
  });
  it("records limit and status changes with the note", () => {
    expect(creditChange(base, { limitPaise: 20_000_000, creditDays: null, status: "hold" }, "new shop")).toEqual({
      oldLimitPaise: null,
      newLimitPaise: 20_000_000,
      oldCreditDays: null,
      newCreditDays: null,
      oldStatus: "ok",
      newStatus: "hold",
      note: "new shop",
    });
    expect(creditChange({ ...base, limitPaise: 100 }, base)?.newLimitPaise).toBeNull();
  });
});

describe("creditChangeParts", () => {
  it("shows only what changed", () => {
    expect(
      creditChangeParts({
        oldLimitPaise: 20_000_000,
        newLimitPaise: 50_000_000,
        oldCreditDays: 30,
        newCreditDays: 45,
        oldStatus: "ok",
        newStatus: "hold",
      }),
    ).toEqual(["₹2,00,000 → ₹5,00,000", "30 → 45 days", "OK → On hold"]);
    expect(
      creditChangeParts({
        oldLimitPaise: null,
        newLimitPaise: 20_000_000,
        oldCreditDays: null,
        newCreditDays: null,
        oldStatus: "ok",
        newStatus: "ok",
      }),
    ).toEqual(["No limit → ₹2,00,000"]);
    expect(
      creditChangeParts({
        oldLimitPaise: 100,
        newLimitPaise: 100,
        oldCreditDays: 45,
        newCreditDays: null,
        oldStatus: "hold",
        newStatus: "blocked",
      }),
    ).toEqual(["45 days → Default", "On hold → Blocked"]);
    expect(
      creditChangeParts({
        oldLimitPaise: null,
        newLimitPaise: null,
        oldCreditDays: null,
        newCreditDays: 1,
        oldStatus: "ok",
        newStatus: "ok",
      }),
    ).toEqual(["Default → 1 day"]);
  });
});
