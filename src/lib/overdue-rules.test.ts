import { describe, expect, it } from "vitest";
import { toISTDateKey } from "./datetime";
import { agingBuckets, duesFromLedger, type LedgerRow } from "./due-items";
import {
  ageText,
  ageTone,
  buildOverdueRows,
  collectToday,
  coverTone,
  daysOfCover,
  filterOverdue,
  lastPaymentDay,
  minDaysParam,
  monthStartIST,
  overdueEmptyTitle,
  overdueLimitParam,
  overdueOf,
  overdueSummary,
  shopScope,
  sortOverdue,
  type OverdueRow,
  type OverdueShop,
} from "./overdue-rules";

// Day n of 2026 at 11:30 IST (06:00 UTC).
const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n, 6));
const key = (n: number) => day(n).toISOString().slice(0, 10);
const row = (kind: string, amountPaise: number, d: number, orderId: string | null = null): LedgerRow => ({
  kind,
  amountPaise,
  orderId,
  createdAt: day(d),
});
const order = (amount: number, d: number) => row("order_debit", amount, d, `o${d}`);
const pay = (amount: number, d: number) => row("receipt_credit", -amount, d);
const reversal = (amount: number, d: number) => row("receipt_reversal", amount, d);

const items = (rows: LedgerRow[]) => duesFromLedger(rows).items;

describe("overdueOf", () => {
  it("matches the FIFO dues report: overdue at 30 days = the 31+ day buckets", () => {
    const ledgers: LedgerRow[][] = [
      [order(100_00, 0), order(50_00, 20), pay(120_00, 25)],
      [order(100_00, 0), pay(30_00, 5), order(200_00, 40), pay(80_00, 70)],
      [row("opening", 500_00, 0), order(100_00, 10), pay(500_00, 50), order(70_00, 60)],
      [order(10_00, 0), order(10_00, 31), order(10_00, 61), order(10_00, 91)],
    ];
    // A seeded random set too, so many shapes are checked.
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let l = 0; l < 30; l++) {
      const rows: LedgerRow[] = [];
      for (let d = 0; d < 150; d += 1 + Math.floor(rnd() * 15)) {
        rows.push(rnd() < 0.6 ? order(Math.floor(rnd() * 1000_00) + 1, d) : pay(Math.floor(rnd() * 800_00) + 1, d));
      }
      ledgers.push(rows);
    }
    const asOf = key(160);
    for (const rows of ledgers) {
      const dues = duesFromLedger(rows);
      const b = agingBuckets(dues, asOf);
      const o = overdueOf(dues.items, null, asOf);
      expect(o.duePaise).toBe(dues.duePaise);
      expect(o.overduePaise).toBe(b.d31_60 + b.d61_90 + b.d90plus);
    }
  });

  it("a payment clears the oldest dispatch first", () => {
    // 100 on day 0, 50 on day 20, paid 120 → 30 left of the day-20 load.
    const o = overdueOf(items([order(100_00, 0), order(50_00, 20), pay(120_00, 25)]), null, key(50));
    expect(o).toEqual({ duePaise: 30_00, overduePaise: 0, oldestDaysPastTerms: 0 });
    const later = overdueOf(items([order(100_00, 0), order(50_00, 20), pay(120_00, 25)]), null, key(62));
    expect(later).toEqual({ duePaise: 30_00, overduePaise: 30_00, oldestDaysPastTerms: 12 });
  });

  it("uses the shop's credit days: default 30, own 45, 0", () => {
    const it42 = items([order(100_00, 0)]);
    expect(overdueOf(it42, null, key(42)).oldestDaysPastTerms).toBe(12);
    expect(overdueOf(it42, 45, key(42))).toEqual({ duePaise: 100_00, overduePaise: 0, oldestDaysPastTerms: 0 });
    expect(overdueOf(it42, 0, key(42)).oldestDaysPastTerms).toBe(42);
    expect(overdueOf(items([order(100_00, 0)]), 0, key(0)).overduePaise).toBe(0);
    expect(overdueOf(items([order(100_00, 0)]), 0, key(1)).overduePaise).toBe(100_00);
  });

  it("exactly 30 days is not overdue, 31 is", () => {
    const i = items([order(100_00, 0)]);
    expect(overdueOf(i, null, key(30)).overduePaise).toBe(0);
    expect(overdueOf(i, null, key(31))).toEqual({ duePaise: 100_00, overduePaise: 100_00, oldestDaysPastTerms: 1 });
  });

  it("the oldest overdue item sets the days", () => {
    const o = overdueOf(items([order(10_00, 0), order(20_00, 20), order(30_00, 50)]), null, key(60));
    expect(o).toEqual({ duePaise: 60_00, overduePaise: 30_00, oldestDaysPastTerms: 30 });
  });

  it("a payment reversal brings the old item back", () => {
    const rows = [order(100_00, 0), pay(100_00, 5)];
    expect(overdueOf(items(rows), null, key(40)).duePaise).toBe(0);
    const o = overdueOf(items([...rows, reversal(100_00, 39)]), null, key(40));
    expect(o).toEqual({ duePaise: 100_00, overduePaise: 100_00, oldestDaysPastTerms: 10 });
  });
});

const shop = (id: string, extra: Partial<OverdueShop> = {}): OverdueShop => ({
  id,
  name: `Shop ${id}`,
  place: "Ward 4",
  phone: "9876543210",
  creditDays: null,
  active: true,
  salesRepId: "rep1",
  salesRepName: "Ravi",
  ...extra,
});
const at = (retailerId: string, r: LedgerRow) => ({ ...r, retailerId });

describe("buildOverdueRows", () => {
  const shops = new Map([
    ["a", shop("a")],
    ["b", shop("b", { creditDays: 45 })],
    ["c", shop("c")],
    ["d", shop("d", { active: false })],
  ]);
  const ledger = [
    at("a", order(100_00, 0)),
    at("b", order(200_00, 0)),
    at("c", order(50_00, 0)),
    at("d", order(70_00, 0)),
    at("c", pay(80_00, 10)), // advance: no row
    at("a", pay(40_00, 30)),
  ];
  const last = new Map([["a", { totalPaise: 40_00, receivedOn: key(30) }]]);
  const rows = buildOverdueRows(ledger, shops, last, key(40));

  it("lists only shops that owe, with overdue, days and last payment", () => {
    expect(rows.map((r) => r.retailerId).sort()).toEqual(["a", "b", "d"]);
    const a = rows.find((r) => r.retailerId === "a")!;
    expect(a).toMatchObject({ duePaise: 60_00, overduePaise: 60_00, daysPastTerms: 10, salesRepName: "Ravi" });
    expect(a.lastPayment).toEqual({ totalPaise: 40_00, receivedOn: key(30) });
    expect(toISTDateKey(lastPaymentDay(a.lastPayment!))).toBe(key(30));
    const b = rows.find((r) => r.retailerId === "b")!;
    expect(b).toMatchObject({ duePaise: 200_00, overduePaise: 0, daysPastTerms: 0, lastPayment: null });
  });

  it("the last payment day is 00:00 IST of the day it was received", () => {
    expect(lastPaymentDay({ receivedOn: "2026-10-24" }).toISOString()).toBe("2026-10-23T18:30:00.000Z");
  });

  it("keeps a switched-off shop with dues", () => {
    expect(rows.find((r) => r.retailerId === "d")).toMatchObject({ active: false, overduePaise: 70_00 });
  });
});

const r = (id: string, o: Partial<OverdueRow> = {}): OverdueRow => ({
  retailerId: id,
  name: id,
  place: "",
  phone: "",
  active: true,
  salesRepId: "rep1",
  salesRepName: null,
  duePaise: 100,
  overduePaise: 100,
  daysPastTerms: 10,
  lastPayment: null,
  ...o,
});

describe("filterOverdue and sortOverdue", () => {
  const rows = [
    r("off-big", { active: false, overduePaise: 900, duePaise: 900 }),
    r("small", { overduePaise: 50, daysPastTerms: 95 }),
    r("big", { overduePaise: 500, duePaise: 500, daysPastTerms: 30 }),
    r("other-rep", { salesRepId: "rep2", overduePaise: 300, daysPastTerms: 61 }),
    r("not-yet", { overduePaise: 0, daysPastTerms: 0 }),
    r("b-tie", { overduePaise: 200 }),
    r("a-tie", { overduePaise: 200 }),
  ];

  it("keeps only overdue shops, on ones first by overdue then name, off ones after", () => {
    expect(filterOverdue(rows, { minDays: 0 }).map((x) => x.retailerId)).toEqual([
      "big",
      "other-rep",
      "a-tie",
      "b-tie",
      "small",
      "off-big",
    ]);
  });

  it("filters by days past terms", () => {
    expect(filterOverdue(rows, { minDays: 30 }).map((x) => x.retailerId)).toEqual(["big", "other-rep", "small"]);
    expect(filterOverdue(rows, { minDays: 60 }).map((x) => x.retailerId)).toEqual(["other-rep", "small"]);
    expect(filterOverdue(rows, { minDays: 90 }).map((x) => x.retailerId)).toEqual(["small"]);
  });

  it("filters by sales person", () => {
    expect(filterOverdue(rows, { minDays: 0, repId: "rep2" }).map((x) => x.retailerId)).toEqual(["other-rep"]);
    expect(filterOverdue(rows, { minDays: 0, repId: "rep1" })).toHaveLength(5);
  });

  it("sortOverdue puts switched-off shops last", () => {
    expect(sortOverdue([r("x", { active: false, overduePaise: 999 }), r("y", { overduePaise: 1 })]).map((x) => x.retailerId)).toEqual(["y", "x"]);
  });

  it("summary adds overdue and counts shops", () => {
    expect(overdueSummary(filterOverdue(rows, { minDays: 60 }))).toEqual({ overduePaise: 350, shops: 2 });
    expect(overdueSummary([])).toEqual({ overduePaise: 0, shops: 0 });
  });
});

describe("shopScope with filterOverdue", () => {
  const rows = [r("mine", { salesRepId: "u1" }), r("theirs", { salesRepId: "u2" }), r("none", { salesRepId: null })];

  it("sales only sees their own shops", () => {
    const s = shopScope("sales", "u1");
    expect(s).toEqual({ repId: "u1", canPickAll: false });
    expect(filterOverdue(rows, { minDays: 0, repId: s!.repId }).map((x) => x.retailerId)).toEqual(["mine"]);
    expect(shopScope("sales,logistics", "u1")).toEqual({ repId: "u1", canPickAll: false });
  });

  it("admin and accounts see all and may pick", () => {
    for (const role of ["admin", "accounts", "sales,accounts", "user,admin"]) {
      const s = shopScope(role, "u1");
      expect(s).toEqual({ repId: null, canPickAll: true });
      expect(filterOverdue(rows, { minDays: 0, repId: s!.repId })).toHaveLength(3);
    }
  });

  it("anyone else gets no access", () => {
    expect(shopScope("logistics", "u1")).toBeNull();
    expect(shopScope("retailer", "u1")).toBeNull();
    expect(shopScope(null, "u1")).toBeNull();
    expect(shopScope("", "u1")).toBeNull();
  });
});

describe("collectToday", () => {
  const rows = [
    r("due-big", { overduePaise: 0, duePaise: 900 }),
    r("od-small", { overduePaise: 100, duePaise: 100 }),
    r("od-big", { overduePaise: 500, duePaise: 600 }),
    r("due-small", { overduePaise: 0, duePaise: 50 }),
    r("off", { active: false, overduePaise: 5000, duePaise: 5000 }),
    r("rep2", { salesRepId: "rep2", overduePaise: 700, duePaise: 700 }),
  ];

  it("overdue first, then by dues, off shops last, own shops only", () => {
    expect(collectToday(rows, "rep1").map((x) => x.retailerId)).toEqual(["od-big", "od-small", "due-big", "due-small", "off"]);
  });

  it("all shops when no rep, cut to the limit", () => {
    expect(collectToday(rows, undefined, 3).map((x) => x.retailerId)).toEqual(["rep2", "od-big", "od-small"]);
    expect(collectToday(rows, undefined)).toHaveLength(6);
    const many = Array.from({ length: 15 }, (_, i) => r(`s${i}`));
    expect(collectToday(many, "rep1")).toHaveLength(10);
  });
});

describe("params and words", () => {
  it("min days", () => {
    expect(minDaysParam("60")).toBe(60);
    expect(minDaysParam("45")).toBe(0);
    expect(minDaysParam(undefined)).toBe(0);
    expect(minDaysParam(["30", "60"])).toBe(0);
  });

  it("limit is 100..1000 in steps of 100", () => {
    expect(overdueLimitParam(undefined)).toBe(100);
    expect(overdueLimitParam("200")).toBe(200);
    expect(overdueLimitParam("150")).toBe(200);
    expect(overdueLimitParam("5000")).toBe(1000);
    expect(overdueLimitParam("-3")).toBe(100);
    expect(overdueLimitParam("abc")).toBe(100);
  });

  it("empty titles", () => {
    expect(overdueEmptyTitle(0)).toBe("No overdue shops");
    expect(overdueEmptyTitle(60)).toBe("Nothing over 60 days");
  });
});

describe("daysOfCover and coverTone", () => {
  it("stock ÷ average daily dispatch, whole days", () => {
    expect(daysOfCover(600, 1400)).toBe(6); // 100 a day
    expect(daysOfCover(650, 1400)).toBe(6);
    expect(daysOfCover(50, 1400)).toBe(0);
    expect(daysOfCover(300, 70, 7)).toBe(30);
  });

  it("null with no dispatches, 0 with no stock", () => {
    expect(daysOfCover(500, 0)).toBeNull();
    expect(daysOfCover(0, 100)).toBe(0);
    expect(daysOfCover(-20, 100)).toBe(0);
  });

  it("tones", () => {
    expect(coverTone(null)).toBe("muted");
    expect(coverTone(0)).toBe("risk");
    expect(coverTone(1)).toBe("caution");
    expect(coverTone(2)).toBe("caution");
    expect(coverTone(3)).toBe("muted");
  });
});

describe("ageText and ageTone", () => {
  const now = new Date("2026-10-24T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const MIN = 60_000;
  const H = 60 * MIN;

  it("minutes, hours, days", () => {
    expect(ageText(ago(0), now)).toBe("Oldest 1 min");
    expect(ageText(ago(40 * MIN), now)).toBe("Oldest 40 min");
    expect(ageText(ago(59 * MIN), now)).toBe("Oldest 59 min");
    expect(ageText(ago(H), now)).toBe("Oldest 1 h");
    expect(ageText(ago(3 * H + 59 * MIN), now)).toBe("Oldest 3 h");
    expect(ageText(ago(24 * H - 1), now)).toBe("Oldest 23 h");
    expect(ageText(ago(24 * H), now)).toBe("Oldest 1 day");
    expect(ageText(ago(47 * H), now)).toBe("Oldest 1 day");
    expect(ageText(ago(48 * H), now)).toBe("Oldest 2 days");
    expect(ageText(new Date(now.getTime() + H), now)).toBe("Oldest 1 min");
  });

  it("risk only when older than one day", () => {
    expect(ageTone(ago(3 * H), now)).toBe("muted");
    expect(ageTone(ago(24 * H), now)).toBe("muted");
    expect(ageTone(ago(24 * H + 1), now)).toBe("risk");
  });
});

describe("monthStartIST", () => {
  it("is 00:00 IST on the 1st", () => {
    expect(monthStartIST(new Date("2026-10-24T12:00:00Z")).toISOString()).toBe("2026-09-30T18:30:00.000Z");
  });

  it("follows the India date at month edges", () => {
    // 19:00 UTC on 31 Oct is 00:30 IST on 1 Nov.
    expect(monthStartIST(new Date("2026-10-31T19:00:00Z")).toISOString()).toBe("2026-10-31T18:30:00.000Z");
    // 18:00 UTC on 31 Oct is still 31 Oct in India.
    expect(monthStartIST(new Date("2026-10-31T18:00:00Z")).toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(monthStartIST(new Date("2026-12-31T18:30:00Z")).toISOString()).toBe("2026-12-31T18:30:00.000Z");
  });
});
