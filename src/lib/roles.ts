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
