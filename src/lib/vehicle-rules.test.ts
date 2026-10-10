import { describe, expect, it } from "vitest";
import { checkTruck, checkTruckNumber, isValidVehicleNumber, normalizeVehicleNumber, truckNote } from "./vehicle-rules";

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

describe("checkTruckNumber", () => {
  it("cleans the number", () => expect(checkTruckNumber(" br 01-ab 1234")).toEqual({ ok: true, number: "BR01AB1234" }));
  it("asks for a missing number", () => expect(checkTruckNumber("  ")).toEqual({ ok: false, error: "Enter the truck number." }));
  it("refuses a bad number", () => {
    expect(checkTruckNumber("123")).toEqual({ ok: false, error: "Enter a valid truck number, e.g. BR01AB1234." });
  });
});

describe("checkTruck", () => {
  it("normalises everything", () => {
    expect(checkTruck({ number: "br 01 ab 1234", driverName: "  Ravi  Kumar ", driverPhone: "+91 98765 43210" })).toEqual({
      ok: true,
      value: { number: "BR01AB1234", driverName: "Ravi Kumar", driverPhone: "9876543210" },
    });
  });
  it("allows an empty driver phone", () => {
    expect(checkTruck({ number: "BR01AB1234", driverName: "Ravi" })).toEqual({
      ok: true,
      value: { number: "BR01AB1234", driverName: "Ravi", driverPhone: "" },
    });
  });
  it("needs a valid number, a driver name and a valid phone when given", () => {
    expect(checkTruck({ number: "123", driverName: "Ravi" }).ok).toBe(false);
    expect(checkTruck({ number: "BR01AB1234", driverName: " " })).toEqual({ ok: false, error: "Enter the driver name." });
    expect(checkTruck({ number: "BR01AB1234", driverName: "Ravi", driverPhone: "12345" })).toEqual({
      ok: false,
      error: "Enter a 10-digit driver mobile.",
    });
  });
});

describe("truckNote", () => {
  const truck = { number: "BR01AB1234", driverName: "Ravi", driverPhone: "9876543210" };
  it("joins the note, truck and driver", () => {
    expect(truckNote(" Supplier X ", truck)).toBe("Supplier X · Truck BR01AB1234 · Ravi 9876543210");
  });
  it("leaves out empty parts", () => {
    expect(truckNote("", { ...truck, driverPhone: "" })).toBe("Truck BR01AB1234 · Ravi");
  });
  it("stays within 200 characters", () => expect(truckNote("x".repeat(300), truck)).toHaveLength(200));
});
