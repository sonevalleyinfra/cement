/**
 * Reading database errors, as plain functions (no database) so they are easy to test.
 * Postgres says "23505" when a unique rule is broken, "23514" for a CHECK and "23503" for a foreign key. Drizzle wraps the driver's error,
 * so the details may sit on the error itself or on its `cause`.
 */
type PgLike = { code?: unknown; constraint_name?: unknown; constraint?: unknown; cause?: unknown };

function isViolation(code: string, error: unknown, names: readonly string[]): boolean {
  for (let e = error, depth = 0; e && typeof e === "object" && depth < 3; e = (e as PgLike).cause, depth++) {
    const pg = e as PgLike;
    if (pg.code === code) {
      return names.length === 0 || names.some((n) => pg.constraint_name === n || pg.constraint === n);
    }
  }
  return false;
}

/** True if `error` is a unique-rule failure (of the named index, when one is given). */
export function isUniqueViolation(error: unknown, name?: string): boolean {
  return isViolation("23505", error, name ? [name] : []);
}

/** True if `error` is a CHECK failure ("23514") of one of the named rules (any rule when none is given). */
export function isCheckViolation(error: unknown, ...names: string[]): boolean {
  return isViolation("23514", error, names);
}

/** True if `error` is a foreign-key failure ("23503"), e.g. deleting a row another table still points at. */
export function isForeignKeyViolation(error: unknown, name?: string): boolean {
  return isViolation("23503", error, name ? [name] : []);
}
