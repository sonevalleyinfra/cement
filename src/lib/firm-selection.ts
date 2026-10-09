/** Name of the cookie that remembers which firm the user is working on. */
export const FIRM_COOKIE = "selected_firm";
/** Cookie value for the admin-only "All firms" view. */
export const ALL_FIRMS = "all";

export type FirmSelection =
  | { mode: "none"; firmId: null; readOnly: true }
  | { mode: "firm"; firmId: string; readOnly: false }
  | { mode: "all"; firmId: null; readOnly: true };

/**
 * Works out which firm to show. `allowedFirmIds` are the firms the user may use
 * (already ordered). "All firms" is for admin only and is read-only.
 * A missing or invalid cookie falls back to the first allowed firm.
 */
export function resolveFirmSelection(
  cookieValue: string | null | undefined,
  allowedFirmIds: readonly string[],
  admin: boolean,
): FirmSelection {
  if (admin && cookieValue === ALL_FIRMS) return { mode: "all", firmId: null, readOnly: true };
  if (cookieValue && allowedFirmIds.includes(cookieValue)) {
    return { mode: "firm", firmId: cookieValue, readOnly: false };
  }
  const first = allowedFirmIds[0];
  if (first) return { mode: "firm", firmId: first, readOnly: false };
  return { mode: "none", firmId: null, readOnly: true };
}

/** True if `value` may be saved in the cookie for this user. */
export function isValidFirmChoice(
  value: string,
  allowedFirmIds: readonly string[],
  admin: boolean,
): boolean {
  return (admin && value === ALL_FIRMS) || allowedFirmIds.includes(value);
}

/**
 * Writes are only allowed while one firm is picked. "All firms" (admin) is a
 * read-only view, and "none" means the user has no firm at all.
 * Returns the message to show, or null when writing is fine.
 */
export function writeBlockMessage(selection: FirmSelection): string | null {
  if (selection.mode === "all") return "All firms is view only. Pick one firm to make changes.";
  if (selection.mode === "none") return "You do not have access to any firm.";
  return null;
}
