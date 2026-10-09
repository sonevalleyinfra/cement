/** Plain helpers for audit log details (no database). */

export type FieldChanges = {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Compares the old row with the new values and keeps only the fields that changed.
 * Returns null when nothing changed. Only the keys in `after` are looked at.
 */
export function changedFields(
  before: Record<string, unknown> | undefined | null,
  after: Record<string, unknown>,
): FieldChanges | null {
  const out: FieldChanges = { before: {}, after: {} };
  let changed = false;
  for (const key of Object.keys(after)) {
    const old = before ? before[key] : undefined;
    if (!same(old, after[key])) {
      out.before[key] = old ?? null;
      out.after[key] = after[key];
      changed = true;
    }
  }
  return changed ? out : null;
}
