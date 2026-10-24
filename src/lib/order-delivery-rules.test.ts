import { describe, expect, it } from "vitest";
import {
  addDaysToKey,
  byRequiredBy,
  checkDelivery,
  checkNotes,
  defaultOrderSource,
  isPastRequiredBy,
  notesForViewer,
  ORDER_SOURCE_LABELS,
  ORDER_SOURCES,
  orderSourceFor,
  orderSourceLabel,
} from "./order-delivery-rules";
import { toISTDateKey } from "./datetime";

const TODAY = "2026-10-24";
const site = { deliverTo: "site", siteAddress: "Plot 4, Boring Road", receiverPhone: "9876543210" };

describe("order source", () => {
  it("lists the five sources with labels", () => {
    expect(ORDER_SOURCES).toEqual(["shop_app", "rep_visit", "phone", "whatsapp", "office"]);
    expect(Object.values(ORDER_SOURCE_LABELS)).toEqual(["Shop app", "Rep visit", "Phone", "WhatsApp", "Office"]);
    expect(orderSourceLabel("whatsapp")).toBe("WhatsApp");
    expect(orderSourceLabel(null)).toBe("");
  });
  it("a shop's own login is always the shop app, whatever it sends", () => {
    for (const role of ["retailer", null, "", "user"]) {
      for (const picked of ["rep_visit", "office", "phone", "nonsense", undefined]) {
        expect(orderSourceFor(role, picked)).toEqual({ ok: true, source: "shop_app" });
      }
    }
  });
  it("staff pick rep visit, phone, WhatsApp or office; the shop app is refused", () => {
    for (const role of ["sales", "admin", "accounts", "logistics", "sales,accounts"]) {
      for (const picked of ["rep_visit", "phone", "whatsapp", "office"]) {
        expect(orderSourceFor(role, picked)).toEqual({ ok: true, source: picked });
      }
      for (const picked of ["shop_app", "", undefined, "email"]) {
        expect(orderSourceFor(role, picked)).toEqual({ ok: false, error: "Pick where the order came from" });
      }
    }
  });
  it("the chip picked first: sales → rep visit, admin and others → office", () => {
    expect(defaultOrderSource("sales")).toBe("rep_visit");
    expect(defaultOrderSource("admin")).toBe("office");
    expect(defaultOrderSource("sales,admin")).toBe("office");
    expect(defaultOrderSource("accounts")).toBe("office");
    expect(defaultOrderSource("retailer")).toBe("shop_app");
  });
});

describe("checkDelivery", () => {
  it("defaults to the shop with nothing else", () => {
    expect(checkDelivery({}, TODAY)).toEqual({
      ok: true,
      delivery: { deliverTo: "shop", siteAddress: null, receiverName: null, receiverPhone: null, requiredBy: null },
    });
  });
  it("refuses anything but shop or site", () => {
    expect(checkDelivery({ deliverTo: "godown" }, TODAY).ok).toBe(false);
  });
  it("shop: a typed site address is dropped; receiver fields are optional", () => {
    const r = checkDelivery({ deliverTo: "shop", siteAddress: "somewhere", receiverName: " Ravi ", receiverPhone: "9876543210" }, TODAY);
    expect(r).toEqual({
      ok: true,
      delivery: { deliverTo: "shop", siteAddress: null, receiverName: "Ravi", receiverPhone: "9876543210", requiredBy: null },
    });
  });
  it("site: needs the address and the receiver's phone", () => {
    expect(checkDelivery({ ...site, siteAddress: "   " }, TODAY)).toEqual({ ok: false, error: "Enter the site address" });
    expect(checkDelivery({ ...site, receiverPhone: "" }, TODAY)).toEqual({ ok: false, error: "Enter the receiver's phone" });
    expect(checkDelivery({ ...site, siteAddress: "  Plot 4,   Boring Road " }, TODAY)).toMatchObject({
      ok: true,
      delivery: { deliverTo: "site", siteAddress: "Plot 4, Boring Road", receiverName: null },
    });
  });
  it("limits the address to 200 and the name to 80 characters", () => {
    expect(checkDelivery({ ...site, siteAddress: "a".repeat(200) }, TODAY).ok).toBe(true);
    expect(checkDelivery({ ...site, siteAddress: "a".repeat(201) }, TODAY).ok).toBe(false);
    expect(checkDelivery({ ...site, receiverName: "n".repeat(80) }, TODAY).ok).toBe(true);
    expect(checkDelivery({ ...site, receiverName: "n".repeat(81) }, TODAY).ok).toBe(false);
  });
  it("normalises the phone (+91, 0, spaces) and refuses what is not a mobile", () => {
    for (const phone of ["+91 98765 43210", "09876543210", "919876543210", "98765-43210"]) {
      expect(checkDelivery({ ...site, receiverPhone: phone }, TODAY)).toMatchObject({ ok: true, delivery: { receiverPhone: "9876543210" } });
    }
    for (const phone of ["12345", "5876543210", "98765432101", "abc"]) {
      expect(checkDelivery({ ...site, receiverPhone: phone }, TODAY)).toEqual({ ok: false, error: "Enter a 10-digit phone" });
      expect(checkDelivery({ deliverTo: "shop", receiverPhone: phone }, TODAY)).toEqual({ ok: false, error: "Enter a 10-digit phone" });
    }
  });
  it("needed by: optional, a real date from today up to 60 days ahead", () => {
    const by = (requiredBy: string) => checkDelivery({ requiredBy }, TODAY);
    expect(by("")).toMatchObject({ ok: true, delivery: { requiredBy: null } });
    expect(by(TODAY)).toMatchObject({ ok: true, delivery: { requiredBy: TODAY } });
    expect(by("2026-12-23")).toMatchObject({ ok: true, delivery: { requiredBy: "2026-12-23" } });
    expect(by("2026-12-24")).toEqual({ ok: false, error: "Pick a date within 60 days" });
    expect(by("2026-10-23")).toEqual({ ok: false, error: "Pick a date from today on" });
    expect(by("2026-02-30")).toEqual({ ok: false, error: "Pick a date from today on" });
    expect(by("24/10/2026")).toEqual({ ok: false, error: "Pick a date from today on" });
  });
  it("today is the India date: just after midnight IST is already the next day", () => {
    // 18:45 UTC on 23 Oct = 00:15 on 24 Oct in India.
    const today = toISTDateKey(new Date("2026-10-23T18:45:00Z"));
    expect(today).toBe("2026-10-24");
    expect(checkDelivery({ requiredBy: "2026-10-23" }, today).ok).toBe(false);
    expect(checkDelivery({ requiredBy: "2026-10-24" }, today).ok).toBe(true);
    // 18:15 UTC on 23 Oct is still 23 Oct in India.
    expect(checkDelivery({ requiredBy: "2026-10-23" }, toISTDateKey(new Date("2026-10-23T18:15:00Z"))).ok).toBe(true);
  });
  it("addDaysToKey crosses months and years", () => {
    expect(addDaysToKey("2026-10-24", 60)).toBe("2026-12-23");
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("dispatch order by needed-by", () => {
  it("earliest date first, no date last, ties keep their order", () => {
    const rows = [
      { id: "a", requiredBy: null },
      { id: "b", requiredBy: "2026-10-30" },
      { id: "c", requiredBy: "2026-10-25" },
      { id: "d", requiredBy: null },
      { id: "e", requiredBy: "2026-10-25" },
    ];
    expect(byRequiredBy(rows).map((r) => r.id)).toEqual(["c", "e", "b", "a", "d"]);
  });
  it("a date before today is late", () => {
    expect(isPastRequiredBy("2026-10-23", TODAY)).toBe(true);
    expect(isPastRequiredBy(TODAY, TODAY)).toBe(false);
    expect(isPastRequiredBy(null, TODAY)).toBe(false);
  });
});

describe("checkNotes", () => {
  it("staff send both notes, trimmed", () => {
    expect(checkNotes("sales", { staffNote: " gave 5 off ", shopNote: " back gate " })).toEqual({
      ok: true,
      staffNote: "gave 5 off",
      shopNote: "back gate",
    });
  });
  it("a shop's own login only writes the shop note; a staff note it sends is dropped", () => {
    for (const role of ["retailer", null, "user"]) {
      expect(checkNotes(role, { staffNote: "secret", shopNote: "hi" })).toEqual({ ok: true, staffNote: "", shopNote: "hi" });
    }
  });
  it("300 characters at most each", () => {
    expect(checkNotes("admin", { shopNote: "x".repeat(300) }).ok).toBe(true);
    expect(checkNotes("admin", { shopNote: "x".repeat(301) }).ok).toBe(false);
    expect(checkNotes("admin", { staffNote: "x".repeat(301) }).ok).toBe(false);
    // A shop's staff note is dropped before the length check.
    expect(checkNotes("retailer", { staffNote: "x".repeat(301) }).ok).toBe(true);
  });
});

describe("notesForViewer", () => {
  const order = { shopNote: "Unload at the back", staffNote: "Rate 340, gave Rs 5 off" };
  it("staff see both notes", () => {
    for (const role of ["admin", "sales", "accounts", "logistics", "sales,accounts", "retailer,sales"]) {
      expect(notesForViewer(role, order)).toEqual({ shopNote: "Unload at the back", staffNote: "Rate 340, gave Rs 5 off" });
    }
  });
  it("a retailer, a login with no role or an unknown role never gets the staff note", () => {
    for (const role of ["retailer", null, undefined, "", "user", "manager"]) {
      expect(notesForViewer(role, order)).toEqual({ shopNote: "Unload at the back", staffNote: null });
    }
  });
  it("staff with no staff note selected get an empty one", () => {
    expect(notesForViewer("admin", { shopNote: "" })).toEqual({ shopNote: "", staffNote: "" });
  });
});
