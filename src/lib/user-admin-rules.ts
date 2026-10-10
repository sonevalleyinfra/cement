/** Rules for the users page. Plain functions: no database, no request. */
import { checkTempPassword } from "@/lib/password-rules";
import { isValidIndianMobile, normalizePhone } from "@/lib/retailer-rules";
import { isRole, parseRoles, type Role } from "@/lib/roles";

const STAFF_ROLES: readonly Role[] = ["admin", "sales", "accounts", "logistics"];

/** `password` is the admin's temporary password, or null to email a "choose your password" link. */
export type UserInput = {
  name: string;
  email: string;
  phone: string;
  roles: Role[];
  firmIds: string[];
  password: string | null;
};

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

/** Cleans a user's phone. Returns the 10-digit mobile, or null if it is not valid. */
export function cleanUserPhone(raw: string | null | undefined): string | null {
  const phone = normalizePhone(raw ?? "");
  return isValidIndianMobile(phone) ? phone : null;
}

/** Cleans an email (trimmed, lower case). Returns it, or null if it does not look like an email. */
export function cleanEmail(raw: string | null | undefined): string | null {
  const email = (raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/**
 * Trims and checks the create-user form. The phone is a required 10-digit mobile.
 * The temporary password is optional (blank gives null).
 */
export function validateNewUser(raw: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  roles?: readonly string[];
  firmIds?: readonly string[];
  password?: string | null;
}): UserCheck {
  const name = (raw.name ?? "").trim().replace(/\s+/g, " ");
  const email = cleanEmail(raw.email);
  if (!name) return { ok: false, error: "Enter a name" };
  if (!email) return { ok: false, error: "Enter a valid email" };
  const phone = cleanUserPhone(raw.phone);
  if (!phone) return { ok: false, error: "Enter a 10-digit mobile" };
  const roles = [...new Set(raw.roles ?? [])];
  const firmIds = [...new Set(raw.firmIds ?? [])];
  const problem = checkRolesAndFirms(roles, firmIds);
  if (problem) return { ok: false, error: problem };
  const password = checkTempPassword(raw.password);
  if (!password.ok) return password;
  return { ok: true, value: { name, email, phone, roles: roles as Role[], firmIds, password: password.value } };
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


/**
 * Deleting only hides a user and marks them deleted (their orders, receipts and history stay).
 * Allowed once the account is deactivated, and never on yourself. Returns an error or null.
 */
export function checkDelete(isSelf: boolean, isActive: boolean): string | null {
  if (isSelf) return "You cannot delete yourself";
  if (isActive) return "Deactivate first";
  return null;
}

/** The users page groups people by role. "none" collects anyone without a known role. */
export type RoleTab = Role | "none";

/** Users who hold `tab` (a person with several roles shows under each) and match `active`. */
export function usersInTab<T extends { role: string; active: boolean }>(
  rows: readonly T[],
  tab: RoleTab,
  active: boolean,
): T[] {
  return rows.filter((r) => {
    if (r.active !== active) return false;
    const roles = parseRoles(r.role);
    return tab === "none" ? roles.length === 0 : roles.includes(tab);
  });
}
