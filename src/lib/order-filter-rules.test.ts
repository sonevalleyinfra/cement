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
  buildRetailersHref,
  DONE_ORDER_STATUSES,
  groupOrders,
  hasScopeTabs,
  OPEN_ORDER_STATUSES,
  orderBackHref,
  orderDetailHref,
  orderGroupLabel,
  orderGroupOf,
  parseDone,
  parseOrderScope,
  parseOrdersListState,
  parseRetailerScope,
} from "./order-filter-rules";
import { ORDER_STATUSES } from "./order-rules";

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
    expect(defaultOrderFilter("sales")).toBe("all");
    expect(defaultOrderFilter("accounts")).toBe("all");
    expect(defaultOrderFilter("logistics")).toBe("all");
    expect(defaultOrderFilter("retailer")).toBe("all");
    expect(defaultOrderFilter("admin")).toBe("all");
    expect(defaultOrderFilter(null)).toBe("all");
  });
});

describe("parseOrderFilter", () => {
  it("accepts a tab the person has", () => {
    expect(parseOrderFilter("rate", "sales")).toBe("rate");
    expect(parseOrderFilter(["send", "x"], "logistics")).toBe("send");
  });
  it("falls back to All for anything else", () => {
    expect(parseOrderFilter(undefined, "sales")).toBe("all");
    expect(parseOrderFilter("nonsense", "sales")).toBe("all");
    // a tab of another job
    expect(parseOrderFilter("approve", "sales")).toBe("all");
    expect(parseOrderFilter("send", "retailer")).toBe("all");
    expect(parseOrderFilter("rate", "retailer")).toBe("all");
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
    expect(orderFilterValue("all", "sales")).toBe("");
    expect(orderFilterValue("rate", "sales")).toBe("rate");
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
  it("leaves out empty and default parts", () => {
    expect(buildOrdersHref({})).toBe("/orders");
    expect(buildOrdersHref({ show: "", q: "", n: 1, done: false, scope: "mine" })).toBe("/orders");
  });

  it("keeps the search across tabs and pages", () => {
    expect(buildOrdersHref({ show: "open", q: "sharma" })).toBe("/orders?show=open&q=sharma");
    expect(buildOrdersHref({ q: "ram traders", n: 2 })).toBe("/orders?q=ram+traders&n=2");
    expect(buildOrdersHref({ show: "all", n: 3 })).toBe("/orders?show=all&n=3");
  });

  it("includes All and an open Done", () => {
    expect(buildOrdersHref({ scope: "all" })).toBe("/orders?scope=all");
    expect(buildOrdersHref({ scope: "all", done: true, n: 2 })).toBe("/orders?scope=all&done=1&n=2");
  });
});

describe("hasScopeTabs", () => {
  it("is for a sales person who is not admin", () => {
    expect(hasScopeTabs("sales")).toBe(true);
    expect(hasScopeTabs("sales,accounts")).toBe(true);
    for (const role of ["admin", "admin,sales", "accounts", "logistics", "retailer", null, undefined]) {
      expect(hasScopeTabs(role)).toBe(false);
    }
  });
});

describe("parseOrderScope", () => {
  it("is Mine for sales unless All is asked for", () => {
    expect(parseOrderScope(undefined, "sales")).toBe("mine");
    expect(parseOrderScope("nonsense", "sales")).toBe("mine");
    expect(parseOrderScope("all", "sales")).toBe("all");
    expect(parseOrderScope(["all", "mine"], "sales")).toBe("all");
  });
  it("other roles always get all", () => {
    expect(parseOrderScope("mine", "accounts")).toBe("all");
    expect(parseOrderScope(undefined, "admin,sales")).toBe("all");
  });
  it("retailers use the same rule and leave Mine out of the address", () => {
    expect(parseRetailerScope("all", "sales")).toBe("all");
    expect(parseRetailerScope(undefined, "sales")).toBe("mine");
    expect(buildRetailersHref("all")).toBe("/retailers?scope=all");
    expect(buildRetailersHref("mine")).toBe("/retailers");
  });
});

describe("parseDone", () => {
  it("only 1 opens it", () => {
    expect(parseDone("1")).toBe(true);
    expect(parseDone(["1"])).toBe(true);
    expect(parseDone("0")).toBe(false);
    expect(parseDone("true")).toBe(false);
    expect(parseDone(undefined)).toBe(false);
  });
});

describe("orderGroupOf", () => {
  it.each([
    ["placed", null, "rate"],
    ["placed", 35000, "approve"],
    ["approved", null, "send"],
    ["approved", 35000, "send"],
    ["partly_dispatched", null, "partly"],
    ["partly_dispatched", 35000, "partly"],
    ["dispatched", null, "done"],
    ["dispatched", 35000, "done"],
    ["rejected", null, "done"],
    ["rejected", 35000, "done"],
    ["cancelled", null, "done"],
    ["cancelled", 35000, "done"],
  ])("%s with rate %s is %s", (status, rate, group) => {
    expect(orderGroupOf(status, rate)).toBe(group);
  });

  it("open and done statuses cover every status once", () => {
    expect([...OPEN_ORDER_STATUSES, ...DONE_ORDER_STATUSES].sort()).toEqual([...ORDER_STATUSES].sort());
    for (const s of DONE_ORDER_STATUSES) expect(orderGroupOf(s, null)).toBe("done");
    for (const s of OPEN_ORDER_STATUSES) expect(orderGroupOf(s, 1)).not.toBe("done");
  });
});

describe("orderGroupLabel", () => {
  it("says the missing rate differently in All", () => {
    expect(orderGroupLabel("rate", "mine")).toBe("Rate to fill");
    expect(orderGroupLabel("rate", "all")).toBe("No rate yet");
  });
  it("the other labels are the same in both", () => {
    for (const scope of ["mine", "all"] as const) {
      expect(orderGroupLabel("approve", scope)).toBe("To approve");
      expect(orderGroupLabel("send", scope)).toBe("To send");
      expect(orderGroupLabel("partly", scope)).toBe("Partly sent");
      expect(orderGroupLabel("done", scope)).toBe("Done");
    }
  });
});

describe("groupOrders", () => {
  const row = (id: string, status: string, ratePaise: number | null = null) => ({ id, status, ratePaise });

  it("orders the groups, Done last, and keeps the order inside each", () => {
    const groups = groupOrders(
      [
        row("a", "dispatched"),
        row("b", "partly_dispatched"),
        row("c", "approved"),
        row("d", "placed", 100),
        row("e", "placed"),
        row("f", "placed"),
      ],
      "mine",
    );
    expect(groups.map((g) => g.group)).toEqual(["rate", "approve", "send", "partly", "done"]);
    expect(groups[0].rows.map((r) => r.id)).toEqual(["e", "f"]);
  });

  it("hides empty groups and labels by scope", () => {
    const groups = groupOrders([row("a", "placed"), row("b", "cancelled")], "all");
    expect(groups.map((g) => g.label)).toEqual(["No rate yet", "Done"]);
    expect(groupOrders([], "mine")).toEqual([]);
  });
});

describe("parseOrdersListState", () => {
  it("other roles keep their tabs and have no scope", () => {
    expect(parseOrdersListState({ show: "approve", q: "ram", n: "2", scope: "all", done: "1" }, "accounts")).toEqual({
      show: "approve",
      q: "ram",
      done: false,
      n: 2,
    });
  });

  it("a shop's own login cannot search", () => {
    expect(parseOrdersListState({ q: "ram" }, "retailer").q).toBe("");
  });

  it("sales only keeps show=rate, which drops everything else but the pages", () => {
    expect(parseOrdersListState({ show: "rate", scope: "all", q: "ram", done: "1", n: "2" }, "sales")).toEqual({
      show: "rate",
      q: "",
      done: false,
      n: 2,
    });
    expect(parseOrdersListState({ show: "open" }, "sales").show).toBe("");
    expect(parseOrdersListState({ show: "approve" }, "sales").show).toBe("");
  });

  it("sales pages only count while Done shows, and a search always shows it", () => {
    expect(parseOrdersListState({ n: "3" }, "sales")).toEqual({ show: "", scope: "mine", q: "", done: false, n: 1 });
    expect(parseOrdersListState({ done: "1", n: "3", scope: "all" }, "sales")).toEqual({
      show: "",
      scope: "all",
      q: "",
      done: true,
      n: 3,
    });
    expect(parseOrdersListState({ q: "ram", done: "1", n: "2" }, "sales")).toEqual({
      show: "",
      scope: "mine",
      q: "ram",
      done: false,
      n: 2,
    });
  });
});

describe("orderDetailHref and orderBackHref", () => {
  const id = "3fa2b1c9";
  const fromOf = (href: string) => decodeURIComponent(href.split("?from=")[1] ?? "");

  it("leaves from out for the plain list", () => {
    expect(orderDetailHref(id, {})).toBe(`/orders/${id}`);
  });

  it("round-trips the list state", () => {
    const state = { scope: "all", q: "ram & sons", done: false, n: 2, show: "" } as const;
    const href = orderDetailHref(id, state);
    expect(href).toBe(`/orders/${id}?from=scope%3Dall%26q%3Dram%2B%2526%2Bsons%26n%3D2`);
    expect(orderBackHref(fromOf(href), "sales")).toBe(buildOrdersHref(state));
    expect(orderBackHref(fromOf(orderDetailHref(id, { show: "rate" })), "sales")).toBe("/orders?show=rate");
    expect(orderBackHref(fromOf(orderDetailHref(id, { show: "approve", q: "x" })), "accounts")).toBe("/orders?show=approve&q=x");
  });

  it("ignores junk and outside addresses", () => {
    for (const junk of [
      undefined,
      "",
      42,
      "https://evil.example",
      "https://evil.example/?scope=all",
      "//evil.example?show=rate",
      "/\\evil.example",
      "javascript:alert(1)",
      "nonsense=1",
      "scope=https://evil.example&show=https://evil.example",
    ]) {
      expect(orderBackHref(junk, "sales")).toBe("/orders");
    }
  });

  it("only keeps what this person may use", () => {
    expect(orderBackHref("show=approve", "sales")).toBe("/orders");
    expect(orderBackHref("scope=all", "accounts")).toBe("/orders");
    expect(orderBackHref("n=999", "accounts")).toBe("/orders");
  });
});
