import { describe, expect, it } from "vitest";
import {
  isDuplicateVehicle,
  isValidVehicleNumber,
  normalizeVehicleNumber,
  validateVehicle,
} from "./vehicle-rules";

describe("normalizeVehicleNumber", () => {
  it("uppercases and removes spaces and dashes", () => {
    expect(normalizeVehicleNumber(" br 01-ab 1234 ")).toBe("BR01AB1234");
  });
});

describe("isValidVehicleNumber", () => {
  it("accepts a normal plate", () => expect(isValidVehicleNumber("BR01AB1234")).toBe(true));
  it("accepts a one-digit district code", () => expect(isValidVehicleNumber("DL1CAB1234")).toBe(true));
  it("rejects too short", () => expect(isValidVehicleNumber("BR01AB12")).toBe(false));
  it("rejects missing letters", () => expect(isValidVehicleNumber("BR011234")).toBe(false));
  it("rejects lowercase (normalise first)", () => expect(isValidVehicleNumber("br01ab1234")).toBe(false));
});

describe("validateVehicle", () => {
  it("normalises everything", () => {
    expect(validateVehicle({ number: "br 01 ab 1234", driverName: "  Ravi  Kumar ", driverPhone: "+91 98765 43210" })).toEqual({
      ok: true,
      value: { number: "BR01AB1234", driverName: "Ravi Kumar", driverPhone: "9876543210" },
    });
  });
  it("allows an empty driver phone", () => {
    const r = validateVehicle({ number: "BR01AB1234", driverName: "Ravi" });
    expect(r).toEqual({ ok: true, value: { number: "BR01AB1234", driverName: "Ravi", driverPhone: "" } });
  });
  it("rejects a bad number, name and phone", () => {
    const r = validateVehicle({ number: "123", driverName: " ", driverPhone: "12345" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.number).toBeDefined();
      expect(r.errors.driverName).toBeDefined();
      expect(r.errors.driverPhone).toBeDefined();
    }
  });
});

describe("isDuplicateVehicle", () => {
  const list = [
    { id: "1", number: "BR01AB1234" },
    { id: "2", number: "BR02CD5678" },
  ];
  it("finds a clash", () => expect(isDuplicateVehicle("BR01AB1234", list)).toBe(true));
  it("ignores itself when editing", () => expect(isDuplicateVehicle("BR01AB1234", list, "1")).toBe(false));
  it("passes a new number", () => expect(isDuplicateVehicle("BR03EF9999", list)).toBe(false));
});
