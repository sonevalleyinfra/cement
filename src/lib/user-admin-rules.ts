/** Rules for the users page. Plain functions: no database, no request. */
import { formatINR } from "@/lib/money";
import { checkTempPassword } from "@/lib/password-rules";
import { can, type Action } from "@/lib/permissions";
import { isValidIndianMobile, normalizePhone } from "@/lib/retailer-rules";
import { isRole, parseRoles, type Role } from "@/lib/roles";

const STAFF_ROLES: readonly Role[] = ["admin", "sales", "accounts", "logistics"];

/** `password` is the admin's temporary password, or null to email a "choose your password" link. */
export type UserInput = {
  name: string;
  email: string;
  phone: string;
  roles: Role[];
  password: string | null;
};

export type UserCheck =
  | { ok: true; value: UserInput }
  | { ok: false; error: string };

/** Checks the roles chosen for a user. Returns an error message or null. */
export function checkRoles(roles: readonly string[]): string | null {
  if (roles.length === 0) return "Pick at least one role";
  if (!roles.every(isRole)) return "Unknown role";
  const set = new Set<string>(roles);
  if (set.has("retailer") && STAFF_ROLES.some((r) => set.has(r))) {
    return "A retailer cannot also have a staff role";
  }
  return null;
}

/** Cleans a user's phone. Returns the 10-digit mobile, or null if it is not valid. */
export function cleanUserPhone(raw: string | null | undefined): string | null {
  const phone = normalizePhone(raw ?? "");
  return isValidIndianMobile(phone) ? phone : null;
}

/**
 * The phone when admin edits a user. A phone that is typed must be a 10-digit mobile. Left empty
 * is fine only for someone who never had one (users made before phones were asked for), so their
 * roles or password can still be changed; a phone that was saved cannot be wiped.
 * (Creating a user always needs a phone: validateNewUser.)
 */
export function checkEditedPhone(
  raw: string | null | undefined,
  savedPhone: string | null | undefined,
): { ok: true; phone: string } | { ok: false; error: string } {
  if ((raw ?? "").trim() === "" && !savedPhone) return { ok: true, phone: "" };
  const phone = cleanUserPhone(raw);
  return phone ? { ok: true, phone } : { ok: false, error: "Enter a 10-digit mobile" };
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
  password?: string | null;
}): UserCheck {
  const name = (raw.name ?? "").trim().replace(/\s+/g, " ");
  const email = cleanEmail(raw.email);
  if (!name) return { ok: false, error: "Enter a name" };
  if (!email) return { ok: false, error: "Enter a valid email" };
  const phone = cleanUserPhone(raw.phone);
  if (!phone) return { ok: false, error: "Enter a 10-digit mobile" };
  const roles = [...new Set(raw.roles ?? [])];
  const problem = checkRoles(roles);
  if (problem) return { ok: false, error: problem };
  const password = checkTempPassword(raw.password);
  if (!password.ok) return password;
  return { ok: true, value: { name, email, phone, roles: roles as Role[], password: password.value } };
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

/** The users page groups people by role. "all" is everyone; "none" collects anyone without a known role. */
export type RoleTab = "all" | Role | "none";

/** Users who hold `tab` (a person with several roles shows under each) and match `active`. */
export function usersInTab<T extends { role: string; active: boolean }>(
  rows: readonly T[],
  tab: RoleTab,
  active: boolean,
): T[] {
  return rows.filter((r) => {
    if (r.active !== active) return false;
    if (tab === "all") return true;
    const roles = parseRoles(r.role);
    return tab === "none" ? roles.length === 0 : roles.includes(tab);
  });
}

/** True when these roles leave the person no staff role (so they could no longer hand over cash). */
export function dropsAllStaffRoles(newRoles: readonly string[]): boolean {
  return !newRoles.some((r) => (STAFF_ROLES as readonly string[]).includes(r));
}

/**
 * The shops a sales person must give to someone else before they can be deactivated: every
 * switched-on shop (new orders would wait on nobody) and every switched-off shop that still owes
 * (its dues would be left with nobody to collect them). `balancePaise` > 0 = the shop owes.
 */
export function shopsToHandOver(shops: readonly { active: boolean; balancePaise: number }[]): number {
  return shops.filter((s) => s.active || s.balancePaise > 0).length;
}

/**
 * A sales person who still has shops cannot be deactivated (count from shopsToHandOver).
 * Returns an error naming the count, or null.
 */
export function checkShopsOwned(shopCount: number): string | null {
  if (shopCount > 0) {
    return `They look after ${shopCount} ${shopCount === 1 ? "shop" : "shops"}. Give ${shopCount === 1 ? "it" : "them"} another sales person first.`;
  }
  return null;
}

/**
 * Someone who still holds cash cannot be deactivated, deleted or lose every staff role: the cash
 * would be stuck with nobody to hand it over. `heldPaise` = their cash held now (handovers still
 * waiting for accounts count as held). Returns an error or null.
 */
export function checkCashHeld(heldPaise: number): string | null {
  if (heldPaise > 0) return `Ask them to hand over ${formatINR(heldPaise, { hidePaise: true })} first.`;
  return null;
}

/** The staff row as it is read (and locked) inside a money transaction. */
export type LockedStaff = { role: string | null; banned: boolean | null; deletedAt: Date | null };

/**
 * May this person still record a payment or ask to hand over cash? Checked on their own row, locked
 * in the same transaction as the money rows, so a deactivation, a delete or a role change cannot slip
 * in between: a switched-off person never ends up holding new cash. Returns an error or null.
 */
export function checkCashRecorder(
  person: LockedStaff | null | undefined,
  permission: Extract<Action, "recordReceipt" | "useWallet">,
): string | null {
  if (!person || person.banned || person.deletedAt) return "Your account is switched off.";
  if (!can(person.role, permission)) return "You cannot do this now.";
  return null;
}
