/** Rules for the vehicles master. Plain functions: no database, no request. */
import { isValidIndianMobile, normalizePhone } from "./retailer-rules";

/** Uppercase, with spaces, dashes and dots removed: "br 01-ab 1234" becomes "BR01AB1234". */
export function normalizeVehicleNumber(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Indian plate: 2 letters, 2 digits, 1-3 letters, 4 digits (e.g. BR01AB1234, DL1CAB1234 has 1 digit so is also allowed). */
export function isValidVehicleNumber(number: string): boolean {
  return /^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$/.test(number);
}

export type VehicleInput = { number: string; driverName: string; driverPhone: string };

export type VehicleCheck =
  | { ok: true; value: VehicleInput }
  | { ok: false; errors: Partial<Record<keyof VehicleInput, string>> };

/** Trims and checks the form. Driver phone is optional; when given it must be a 10-digit mobile. */
export function validateVehicle(raw: {
  number?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
}): VehicleCheck {
  const number = normalizeVehicleNumber(raw.number ?? "");
  const driverName = (raw.driverName ?? "").trim().replace(/\s+/g, " ");
  const driverPhone = normalizePhone(raw.driverPhone ?? "");
  const errors: Partial<Record<keyof VehicleInput, string>> = {};
  if (!isValidVehicleNumber(number)) errors.number = "Enter a valid vehicle number, e.g. BR01AB1234";
  if (!driverName) errors.driverName = "Enter the driver name";
  if (driverPhone && !isValidIndianMobile(driverPhone)) errors.driverPhone = "Enter a 10-digit mobile";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { number, driverName, driverPhone } };
}

/** True if another vehicle (not `selfId`) already has this number. */
export function isDuplicateVehicle(
  number: string,
  existing: readonly { id: string; number: string }[],
  selfId?: string,
): boolean {
  return existing.some((v) => v.id !== selfId && v.number === number);
}
