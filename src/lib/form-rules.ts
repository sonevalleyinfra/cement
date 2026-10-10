/**
 * Small rules for form feedback, as plain functions (no React, no database) so they are easy to test.
 *
 * - An error belongs to the values the person had typed when it appeared. As soon as one of those
 *   values changes, the error is gone (`visibleError`). `useFormError` (use-form-error.ts) wraps this.
 * - A button that is switched off because something is missing says what (`firstMissing`).
 */

/** An error message and the form values it was made for. */
export type StoredError = { message: string; key: string };

/** One comparable string for the values a form watches (text, numbers, ids...). */
export function errorKey(watch: unknown): string {
  try {
    return JSON.stringify(watch) ?? "";
  } catch {
    return "";
  }
}

/** The error to show now: the stored one while the watched values are still the same, else nothing. */
export function visibleError(stored: StoredError | null, key: string): string {
  return stored && stored.key === key ? stored.message : "";
}

/**
 * The first missing thing, as a short hint ("Enter the amount"), or null when nothing is missing.
 * Pass the checks in the order the person should fix them: `[isMissing, hint]`.
 */
export function firstMissing(checks: readonly (readonly [missing: boolean, hint: string])[]): string | null {
  for (const [missing, hint] of checks) if (missing) return hint;
  return null;
}
