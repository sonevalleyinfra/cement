/** Rules for the users page. Plain functions: no database, no request. */
import { isValidIndianMobile, normalizePhone } from "@/lib/retailer-rules";
import { isRole, type Role } from "@/lib/roles";

const STAFF_ROLES: readonly Role[] = ["admin", "sales", "accounts", "logistics"];

export type UserInput = { name: string; email: string; phone: string; roles: Role[]; firmIds: string[] };

export type UserCheck =
  | { ok: true; value: UserInput }
  | { ok: false; error: string };

/** Checks the roles and firms chosen for a user. Returns an error message or null. */
export function checkRolesAndFirms(roles: readonly string[], firmIds: readonly string[]): string | null {
  if (roles.length === 0) return "Pick at least one role";
  if (!roles.every(isRole)) return "Unknown role";
  const set = new Set<string>(roles);
  if (set.has("retailer") && STAFF_ROLES.some((r) => set.has(r))) {
    return "A retailer cannot also have a staff role";
  }
  if (!set.has("admin") && firmIds.length === 0) return "Pick at least one firm";
  return null;
}

/** Trims and checks the create-user form. The phone is a required 10-digit mobile. */
export function validateNewUser(raw: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  roles?: readonly string[];
  firmIds?: readonly string[];
}): UserCheck {
  const name = (raw.name ?? "").trim().replace(/\s+/g, " ");
  const email = (raw.email ?? "").trim().toLowerCase();
  if (!name) return { ok: false, error: "Enter a name" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email" };
  const phone = normalizePhone(raw.phone ?? "");
  if (!isValidIndianMobile(phone)) return { ok: false, error: "Enter a 10-digit mobile" };
  const roles = [...new Set(raw.roles ?? [])];
  const firmIds = [...new Set(raw.firmIds ?? [])];
  const problem = checkRolesAndFirms(roles, firmIds);
  if (problem) return { ok: false, error: problem };
  return { ok: true, value: { name, email, phone, roles: roles as Role[], firmIds } };
}

/** An admin must not remove their own admin role. Returns an error or null. */
export function checkSelfRoleChange(isSelf: boolean, newRoles: readonly string[]): string | null {
  if (isSelf && !newRoles.includes("admin")) return "You cannot remove your own admin role";
  return null;
}

/** An admin must not deactivate themselves. Returns an error or null. */
export function checkSelfDeactivate(isSelf: boolean, makeActive: boolean): string | null {
  if (isSelf && !makeActive) return "You cannot deactivate yourself";
  return null;
}

/** A temporary password from random bytes: 12 letters/digits, no look-alike characters. */
export function passwordFromBytes(bytes: Uint8Array): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(bytes.slice(0, 12), (b) => alphabet[b % alphabet.length]).join("");
}

