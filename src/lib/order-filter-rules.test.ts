import { describe, expect, it } from "vitest";
import {
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
