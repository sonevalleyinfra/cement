/**
 * Rules for trucks. Plain functions: no database, no request.
 * Trucks are hired, so none are saved: the number, driver and phone are typed for each purchase or dispatch.
 */
import { isValidIndianMobile, normalizePhone } from "./retailer-rules";

/** Uppercase, with spaces, dashes and dots removed: "br 01-ab 1234" becomes "BR01AB1234". */
export function normalizeVehicleNumber(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Indian plate: 2 letters, 2 digits, 1-3 letters, 4 digits (e.g. BR01AB1234, DL1CAB1234 has 1 digit so is also allowed). */
export function isValidVehicleNumber(number: string): boolean {
  return /^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$/.test(number);
}

/** Just the truck number, cleaned. Null with the reason when it is missing or not a plate. */
export function checkTruckNumber(raw: string | null | undefined): { ok: true; number: string } | { ok: false; error: string } {
  const number = normalizeVehicleNumber(raw ?? "");
  if (!number) return { ok: false, error: "Enter the truck number." };
  if (!isValidVehicleNumber(number)) return { ok: false, error: "Enter a valid truck number, e.g. BR01AB1234." };
  return { ok: true, number };
}

export type Truck = { number: string; driverName: string; driverPhone: string };

/** The quick truck form: number and driver name needed, phone optional (10-digit mobile when given). */
export function checkTruck(raw: {
  number?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
}): { ok: true; value: Truck } | { ok: false; error: string } {
  const number = checkTruckNumber(raw.number);
  if (!number.ok) return number;
  const driverName = (raw.driverName ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!driverName) return { ok: false, error: "Enter the driver name." };
  const driverPhone = normalizePhone(raw.driverPhone ?? "");
  if (driverPhone && !isValidIndianMobile(driverPhone)) return { ok: false, error: "Enter a 10-digit driver mobile." };
  return { ok: true, value: { number: number.number, driverName, driverPhone } };
}

/** The text kept with a purchase into a truck: "Supplier X · Truck BR01AB1234 · Ravi 9876543210" (200 characters at most). */
export function truckNote(note: string, truck: Truck): string {
  const driver = [truck.driverName, truck.driverPhone].filter(Boolean).join(" ");
  return [note.trim(), `Truck ${truck.number}`, driver].filter(Boolean).join(" · ").slice(0, 200);
}
