import { describe, expect, it } from "vitest";
import {
  NO_FILTERS,
  stockByPlace,
  stockByProduct,
  stockTotal,
  typeCodes,
  type StockProduct,
  type StockRow,
} from "./stock-view-rules";

const products: StockProduct[] = [
  { id: "t-opc53", name: "Prism Trade OPC 53", channel: "trade", typeCode: "OPC", grade: "53", bagKg: 50 },
  { id: "t-ppc43", name: "Prism Trade PPC 43", channel: "trade", typeCode: "PPC", grade: "43", bagKg: 50 },
  { id: "n-ppc53", name: "Prism Non-trade PPC 53", channel: "non_trade", typeCode: "PPC", grade: "53", bagKg: 50 },
];
const G = { placeKey: "godown:1", placeName: "Main Godown", placeKind: "godown" };
const B = { placeKey: "godown:2", placeName: "Bypass Store", placeKind: "godown" };
const V = { placeKey: "vehicle:3", placeName: "BR01AB1234", placeKind: "vehicle" };
const rows: StockRow[] = [
  { productId: "n-ppc53", bags: 40, ...G },
  { productId: "t-opc53", bags: 100, ...V },
  { productId: "t-opc53", bags: 200, ...G },
  { productId: "t-ppc43", bags: 0, ...G },
  { productId: "t-ppc43", bags: 60, ...B },
];

describe("stockTotal", () => {
  it("adds bags and weight", () => {
    expect(stockTotal(rows, products, NO_FILTERS)).toEqual({ bags: 400, kg: 20000 });
  });
  it("follows the filters", () => {
    expect(stockTotal(rows, products, { channel: "trade", typeCode: "all" }).bags).toBe(360);
    expect(stockTotal(rows, products, { channel: "all", typeCode: "PPC" }).bags).toBe(100);
    expect(stockTotal(rows, products, { channel: "non_trade", typeCode: "OPC" }).bags).toBe(0);
  });
  it("skips rows of unknown products", () => {
    expect(stockTotal([{ productId: "gone", bags: 5, ...G }], products, NO_FILTERS).bags).toBe(0);
  });
});

describe("stockByProduct", () => {
  it("makes Trade then Non-trade sections, in catalogue order, places godowns first", () => {
    const sections = stockByProduct(rows, products, NO_FILTERS);
    expect(sections.map((s) => s.label)).toEqual(["Trade", "Non-trade"]);
    expect(sections[0].items.map((i) => [i.product.id, i.bags, i.kg])).toEqual([
      ["t-opc53", 300, 15000],
      ["t-ppc43", 60, 3000],
    ]);
    expect(sections[0].items[0].places.map((p) => p.name)).toEqual(["Main Godown", "BR01AB1234"]);
    expect(sections[0].items[1].places.map((p) => p.name)).toEqual(["Bypass Store"]);
  });
  it("leaves out empty products and sections", () => {
    const sections = stockByProduct(rows, products, { channel: "all", typeCode: "OPC" });
    expect(sections).toHaveLength(1);
    expect(sections[0].items.map((i) => i.product.id)).toEqual(["t-opc53"]);
  });
});

describe("stockByPlace", () => {
  it("lists godowns by name, then vehicles, with their products", () => {
    const cards = stockByPlace(rows, products, NO_FILTERS);
    expect(cards.map((c) => [c.name, c.bags])).toEqual([
      ["Bypass Store", 60],
      ["Main Godown", 240],
      ["BR01AB1234", 100],
    ]);
    expect(cards[1].lines.map((l) => [l.product.id, l.bags])).toEqual([
      ["t-opc53", 200],
      ["n-ppc53", 40],
    ]);
  });
  it("adds up repeated rows of the same place and product", () => {
    const cards = stockByPlace([...rows, { productId: "t-opc53", bags: 50, ...G }], products, NO_FILTERS);
    expect(cards.find((c) => c.key === "godown:1")?.lines[0]).toMatchObject({ bags: 250 });
  });
  it("drops places left empty by the filters", () => {
    expect(stockByPlace(rows, products, { channel: "non_trade", typeCode: "all" }).map((c) => c.name)).toEqual([
      "Main Godown",
    ]);
  });
});

describe("typeCodes", () => {
  it("lists each type once, in catalogue order", () => expect(typeCodes(products)).toEqual(["OPC", "PPC"]));
});
