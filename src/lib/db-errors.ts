/**
 * Reading database errors, as plain functions (no database) so they are easy to test.
 * Postgres says "23505" when a unique rule is broken. Drizzle wraps the driver's error,
 * so the details may sit on the error itself or on its `cause`.
 */
type PgLike = { code?: unknown; constraint_name?: unknown; constraint?: unknown; cause?: unknown };

/** True if `error` is a unique-rule failure (of the named index, when one is given). */
export function isUniqueViolation(error: unknown, name?: string): boolean {
  for (let e = error, depth = 0; e && typeof e === "object" && depth < 3; e = (e as PgLike).cause, depth++) {
    const pg = e as PgLike;
    if (pg.code === "23505") return !name || pg.constraint_name === name || pg.constraint === name;
  }
  return false;
}
