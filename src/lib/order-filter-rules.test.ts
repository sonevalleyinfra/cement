import { describe, expect, it } from "vitest";
import {
  buildOrdersHref,
  escapeLike,
  isOrderIdTerm,
  MAX_ORDER_PAGES,
  ORDER_PAGE_SIZE,
  orderSearchTerms,
  parseOrderSearch,
  parsePages,
  orderFilterSpec,
  orderFilterTabs,
  defaultOrderFilter,
  orderFilterValue,
  ORDER_FILTERS,
  ORDER_FILTER_EMPTY,
  ORDER_FILTER_LABELS,
  parseOrderFilter,
  rateFilterOwnShopsOnly,
} from "./order-filter-rules";

describe("orderFilterTabs", () => {
  it("gives each staff job its own tab, then Open and All", () => {
    expect(orderFilterTabs("sales")).toEqual(["rate", "open", "all"]);
    expect(orderFilterTabs("accounts")).toEqual(["approve", "open", "all"]);
    expect(orderFilterTabs("logistics")).toEqual(["send", "open", "all"]);
    expect(orderFilterTabs("sales,accounts")).toEqual(["rate", "approve", "open", "all"]);
  });
  it("admin holds every job", () => {
    expect(orderFilterTabs("admin")).toEqual(["rate", "approve", "send", "open", "all"]);
  });
  it("a shop login gets Open, Done and All", () => {
    expect(orderFilterTabs("retailer")).toEqual(["open", "done", "all"]);
    expect(orderFilterTabs(null)).toEqual(["open", "done", "all"]);
  });
});

describe("defaultOrderFilter", () => {
  it("lands each role on its job", () => {
    expect(defaultOrderFilter("sales")).toBe("rate");
    expect(defaultOrderFilter("accounts")).toBe("approve");
    expect(defaultOrderFilter("logistics")).toBe("send");
    expect(defaultOrderFilter("retailer")).toBe("open");
    expect(defaultOrderFilter("admin")).toBe("all");
    expect(defaultOrderFilter(null)).toBe("open");
  });
});

describe("parseOrderFilter", () => {
  it("accepts a tab the person has", () => {
    expect(parseOrderFilter("rate", "sales")).toBe("rate");
    expect(parseOrderFilter(["send", "x"], "logistics")).toBe("send");
  });
  it("falls back to All for anything else", () => {
    expect(parseOrderFilter(undefined, "sales")).toBe("rate");
    expect(parseOrderFilter("nonsense", "sales")).toBe("rate");
    // a tab of another job
    expect(parseOrderFilter("approve", "sales")).toBe("rate");
    expect(parseOrderFilter("send", "retailer")).toBe("open");
    expect(parseOrderFilter("rate", "retailer")).toBe("open");
    expect(parseOrderFilter("all", "accounts")).toBe("all");
  });
});

describe("orderFilterSpec", () => {
  it("rate to fill = placed without a rate; to approve = placed with a rate", () => {
    expect(orderFilterSpec("rate")).toEqual({ statuses: ["placed"], rate: "missing" });
    expect(orderFilterSpec("approve")).toEqual({ statuses: ["placed"], rate: "filled" });
  });
  it("send = approved and partly dispatched (the dispatch list)", () => {
    expect(orderFilterSpec("send").statuses).toEqual(["approved", "partly_dispatched"]);
  });
  it("open and done together cover every status once", () => {
    const open = orderFilterSpec("open").statuses ?? [];
    const done = orderFilterSpec("done").statuses ?? [];
    expect([...open, ...done].sort()).toEqual(
      ["approved", "cancelled", "dispatched", "partly_dispatched", "placed", "rejected"],
    );
  });
  it("all has no limit", () => {
    expect(orderFilterSpec("all")).toEqual({ statuses: null, rate: null });
  });
  it("every filter has a label and an empty-list text", () => {
    for (const f of ORDER_FILTERS) {
      expect(ORDER_FILTER_LABELS[f]).toBeTruthy();
      expect(ORDER_FILTER_EMPTY[f]).toBeTruthy();
    }
  });
});

describe("rateFilterOwnShopsOnly", () => {
  it("a sales person sees only their shops under Rate to fill; admin sees all", () => {
    expect(rateFilterOwnShopsOnly("sales", "rate")).toBe(true);
    expect(rateFilterOwnShopsOnly("admin", "rate")).toBe(false);
    expect(rateFilterOwnShopsOnly("admin,sales", "rate")).toBe(false);
    expect(rateFilterOwnShopsOnly("sales", "open")).toBe(false);
  });
});

describe("orderFilterValue", () => {
  it("the role's default leaves the address clean", () => {
    expect(orderFilterValue("all", "admin")).toBe("");
    expect(orderFilterValue("rate", "sales")).toBe("");
    expect(orderFilterValue("all", "sales")).toBe("all");
    expect(orderFilterValue("rate", "admin")).toBe("rate");
  });
});

describe("parseOrderSearch", () => {
  it("trims and collapses spaces", () => {
    expect(parseOrderSearch("  Sharma   Traders \t")).toBe("Sharma Traders");
  });

  it("is empty when missing or not text", () => {
    expect(parseOrderSearch(undefined)).toBe("");
    expect(parseOrderSearch("   ")).toBe("");
    expect(parseOrderSearch(42)).toBe("");
  });

  it("takes the first of repeated params", () => {
    expect(parseOrderSearch(["ram", "shyam"])).toBe("ram");
  });

  it("keeps at most 60 characters", () => {
    expect(parseOrderSearch("a".repeat(80))).toHaveLength(60);
    expect(parseOrderSearch(`${"a".repeat(59)} b`)).toBe("a".repeat(59));
  });
});

describe("orderSearchTerms and isOrderIdTerm", () => {
  it("splits into lower-case words", () => {
    expect(orderSearchTerms("Sharma Pune")).toEqual(["sharma", "pune"]);
    expect(orderSearchTerms("")).toEqual([]);
  });

  it("knows an order number start", () => {
    expect(isOrderIdTerm("3fa2")).toBe(true);
    expect(isOrderIdTerm("3FA2B1C9")).toBe(true);
    expect(isOrderIdTerm("3fa2b1c9d")).toBe(false);
    expect(isOrderIdTerm("sharma")).toBe(false);
  });
});

describe("escapeLike", () => {
  it("escapes %, _ and backslash", () => {
    expect(escapeLike("50%_off\\x")).toBe("50\\%\\_off\\\\x");
    expect(escapeLike("plain")).toBe("plain");
  });
});

describe("parsePages", () => {
  it("defaults to 1", () => {
    expect(ORDER_PAGE_SIZE).toBe(50);
    expect(parsePages(undefined)).toBe(1);
    expect(parsePages("abc")).toBe(1);
    expect(parsePages("0")).toBe(1);
    expect(parsePages("-2")).toBe(1);
    expect(parsePages("2.5")).toBe(1);
  });

  it("accepts 1..40", () => {
    expect(parsePages("3")).toBe(3);
    expect(parsePages(["2", "9"])).toBe(2);
    expect(parsePages(String(MAX_ORDER_PAGES))).toBe(40);
    expect(parsePages("41")).toBe(1);
  });
});

describe("buildOrdersHref", () => {
  it("leaves out empty parts", () => {
    expect(buildOrdersHref("", "")).toBe("/orders");
    expect(buildOrdersHref("", "", 1)).toBe("/orders");
  });

  it("keeps the search across tabs and pages", () => {
    expect(buildOrdersHref("open", "sharma")).toBe("/orders?show=open&q=sharma");
    expect(buildOrdersHref("", "ram traders", 2)).toBe("/orders?q=ram+traders&n=2");
    expect(buildOrdersHref("all", "", 3)).toBe("/orders?show=all&n=3");
  });
});
