import { describe, expect, it } from "vitest";
import {
  CLAIM_LABELS,
  CLAIM_STATUSES,
  MAX_PURCHASE_EXTRA_PAISE,
  checkClaimChange,
  checkPurchaseDetails,
  claimValuePaise,
} from "./purchase-rules";

const today = "2026-10-24";
const base = {
  invoiceNo: " INV-77 ",
  invoiceDate: "2026-10-20",
  billedBags: 600,
  shortBags: 0,
  burstBags: 0,
  freightPaise: 0,
  unloadingPaise: 0,
  costPerBagPaise: 29_500,
};
const error = (raw: Partial<typeof base> | Record<string, unknown>) => {
  const r = checkPurchaseDetails({ ...base, ...raw }, today);
  return r.ok ? null : r.error;
};

describe("checkPurchaseDetails", () => {
  it("accepts a full receipt with no extras", () => {
    expect(checkPurchaseDetails(base, today)).toEqual({
      ok: true,
      value: {
        invoiceNo: "INV-77",
        invoiceDate: "2026-10-20",
        billedBags: 600,
        shortBags: 0,
        burstBags: 0,
        receivedBags: 600,
        freightPaise: 0,
        unloadingPaise: 0,
        landedUnitCostPaise: 29_500,
        claimStatus: "none",
      },
    });
  });

  it("works out received bags, landed cost and an open claim for a short receipt", () => {
    const r = checkPurchaseDetails({ ...base, shortBags: 10, burstBags: 2, freightPaise: 720_000, unloadingPaise: 180_000 }, today);
    expect(r.ok && r.value).toMatchObject({ receivedBags: 588, landedUnitCostPaise: 29_500 + 1531, claimStatus: "open" });
  });

  it("needs the invoice no., at most 60 characters", () => {
    expect(error({ invoiceNo: "  " })).toBe("Enter the invoice no.");
    expect(error({ invoiceNo: undefined })).toBe("Enter the invoice no.");
    expect(error({ invoiceNo: "x".repeat(61) })).toBe("That invoice no. is too long.");
    expect(error({ invoiceNo: "x".repeat(60) })).toBeNull();
  });

  it("needs a real invoice date, not in the future", () => {
    expect(error({ invoiceDate: "" })).toBe("Pick a date.");
    expect(error({ invoiceDate: "2026-02-30" })).toBe("Pick a real date.");
    expect(error({ invoiceDate: "2026-10-25" })).toBe("The date cannot be in the future.");
    expect(error({ invoiceDate: today })).toBeNull();
  });

  it("needs whole billed bags from 1 to 999999", () => {
    expect(error({ billedBags: 0 })).toBe("Enter the bags.");
    expect(error({ billedBags: 1.5 })).toBe("Enter the bags.");
    expect(error({ billedBags: "600" })).toBe("Enter the bags.");
    expect(error({ billedBags: 1_000_000 })).toBe("That is too many bags.");
    expect(error({ billedBags: 999_999 })).toBeNull();
  });

  it("takes empty short and burst as 0 and refuses fractions or minus", () => {
    const r = checkPurchaseDetails({ ...base, shortBags: "", burstBags: undefined }, today);
    expect(r.ok && [r.value.shortBags, r.value.burstBags]).toEqual([0, 0]);
    expect(error({ shortBags: -1 })).toBe("Enter whole bags for short and burst.");
    expect(error({ burstBags: 0.5 })).toBe("Enter whole bags for short and burst.");
  });

  it("needs at least one good bag", () => {
    expect(error({ shortBags: 300, burstBags: 300 })).toBe("Received bags must be more than 0.");
    expect(error({ shortBags: 600 })).toBe("Received bags must be more than 0.");
    const r = checkPurchaseDetails({ ...base, shortBags: 599 }, today);
    expect(r.ok && r.value.receivedBags).toBe(1);
  });

  it("takes empty freight and unloading as 0, within ₹5,00,000 each", () => {
    const r = checkPurchaseDetails({ ...base, freightPaise: null, unloadingPaise: "" }, today);
    expect(r.ok && [r.value.freightPaise, r.value.unloadingPaise]).toEqual([0, 0]);
    expect(error({ freightPaise: -100 })).toBe("Enter the freight in rupees.");
    expect(error({ unloadingPaise: 10.5 })).toBe("Enter the unloading in rupees.");
    expect(error({ freightPaise: MAX_PURCHASE_EXTRA_PAISE + 1 })).toBe("That freight is too high.");
    expect(error({ unloadingPaise: MAX_PURCHASE_EXTRA_PAISE + 1 })).toBe("That unloading is too high.");
    expect(error({ freightPaise: MAX_PURCHASE_EXTRA_PAISE, unloadingPaise: MAX_PURCHASE_EXTRA_PAISE })).toBeNull();
  });

  it("needs the cost per bag for the landed cost", () => {
    expect(error({ costPerBagPaise: undefined })).toBe("Enter the cost per bag.");
  });
});

describe("claims", () => {
  it("has a label for every status", () => {
    expect(CLAIM_STATUSES.map((s) => CLAIM_LABELS[s])).toEqual(["No claim", "Claim open", "Claimed", "Credited"]);
  });

  it("only moves forward", () => {
    expect(checkClaimChange("open", "claimed")).toEqual({ ok: true, status: "claimed" });
    expect(checkClaimChange("open", "credited")).toEqual({ ok: true, status: "credited" });
    expect(checkClaimChange("claimed", "credited")).toEqual({ ok: true, status: "credited" });
    expect(checkClaimChange("claimed", "open")).toEqual({ ok: false, error: "That claim can't change to Claim open." });
    expect(checkClaimChange("credited", "claimed")).toEqual({ ok: false, error: "That claim can't change to Claimed." });
    expect(checkClaimChange("none", "open")).toEqual({ ok: false, error: "That claim can't change to Claim open." });
    expect(checkClaimChange("open", "open").ok).toBe(false);
    expect(checkClaimChange("open", "none").ok).toBe(false);
    expect(checkClaimChange("open", "paid")).toEqual({ ok: false, error: "That claim can't change to paid." });
  });

  it("values the claim at the invoice cost per bag", () => {
    expect(claimValuePaise(12, 29_500)).toBe(354_000);
    expect(claimValuePaise(0, 29_500)).toBe(0);
    expect(() => claimValuePaise(1.5, 100)).toThrow();
  });
});
