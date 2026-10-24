import { describe, expect, it } from "vitest";
import { csvCell, rupees, toCsv } from "./csv";

describe("csvCell", () => {
  it("leaves plain text and numbers alone", () => {
    expect(csvCell("Sharma Traders")).toBe("Sharma Traders");
    expect(csvCell(50)).toBe("50");
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell(0)).toBe("0");
  });

  it("quotes cells with comma, quote, CR or LF and doubles inner quotes", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("one\ntwo")).toBe('"one\ntwo"');
    expect(csvCell("one\rtwo")).toBe('"one\rtwo"');
  });

  it("guards text that a spreadsheet could run as a formula", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+1+2")).toBe("'+1+2");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("\tlead")).toBe("'\tlead");
    expect(csvCell("\rlead")).toBe('"\'\rlead"');
    expect(csvCell('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"');
  });

  it("does not guard a negative money amount from rupees()", () => {
    expect(csvCell(rupees(-1250))).toBe("-12.50");
  });

  it("refuses a number that is not finite", () => {
    expect(() => csvCell(Number.NaN)).toThrow();
    expect(() => csvCell(Infinity)).toThrow();
  });
});

describe("toCsv", () => {
  it("starts with a BOM and ends every line with CRLF", () => {
    expect(toCsv([["a", "b"], [1, "c,d"]])).toBe('﻿a,b\r\n1,"c,d"\r\n');
  });

  it("writes a blank row as an empty line", () => {
    expect(toCsv([["a"], [], ["b"]])).toBe("﻿a\r\n\r\nb\r\n");
  });
});

describe("rupees", () => {
  it("writes two decimals with no symbol or commas", () => {
    expect(rupees(123450)).toBe("1234.50");
    expect(rupees(0)).toBe("0.00");
    expect(rupees(5)).toBe("0.05");
    expect(rupees(100)).toBe("1.00");
    expect(rupees(99)).toBe("0.99");
  });

  it("writes negatives with a minus", () => {
    expect(rupees(-5)).toBe("-0.05");
    expect(rupees(-123456)).toBe("-1234.56");
  });

  it("is exact for large values", () => {
    expect(rupees(1_000_000_000_00)).toBe("1000000000.00");
    expect(rupees(Number.MAX_SAFE_INTEGER)).toBe("90071992547409.91");
  });

  it("refuses fractions and unsafe numbers", () => {
    expect(() => rupees(1.5)).toThrow(TypeError);
    expect(() => rupees(Number.NaN)).toThrow(TypeError);
    expect(() => rupees(2 ** 53)).toThrow(TypeError);
  });
});
