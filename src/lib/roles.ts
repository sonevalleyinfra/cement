/**
 * The admin plugin stores roles as a string; a user with several roles has
 * them comma-separated (e.g. "user,admin").
 */
export function hasRole(role: string | null | undefined, wanted: string): boolean {
  if (!role) return false;
  return role
    .split(",")
    .map((r) => r.trim())
    .includes(wanted);
}

export function isAdmin(role: string | null | undefined): boolean {
  return hasRole(role, "admin");
}

/** Every role in the app. Stored in `user.role`, comma-separated when a person has several. */
export const ROLES = ["admin", "sales", "accounts", "logistics", "retailer"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** Splits "sales,accounts" into known roles, ignoring blanks and unknown names. */
export function parseRoles(role: string | null | undefined): Role[] {
  if (!role) return [];
  return role
    .split(",")
    .map((r) => r.trim())
    .filter(isRole);
}

/** Joins roles back into the stored form, without duplicates. */
export function joinRoles(roles: readonly Role[]): string {
  return [...new Set(roles)].join(",");
}

/** True if the user holds any of `allowed`. Admin passes every role check. */
export function hasAnyRole(
  role: string | null | undefined,
  allowed: readonly Role[],
): boolean {
  if (isAdmin(role)) return true;
  return allowed.some((r) => hasRole(role, r));
}

/**
 * Pure retailer = has the retailer role and no staff role (and is not admin).
 * Only a pure retailer is price-blind; someone who is also staff counts as staff.
 */
export function isRetailerOnly(role: string | null | undefined): boolean {
  if (isAdmin(role)) return false;
  const roles = parseRoles(role);
  return roles.includes("retailer") && roles.every((r) => r === "retailer");
}
