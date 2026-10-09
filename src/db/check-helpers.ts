import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * SQL for a CHECK rule "column is one of these words", e.g. `kind in ('a', 'b')`.
 * The words come from our own constant lists (never from users), so writing them
 * straight into the SQL is safe; a quote in a word is refused to be sure.
 */
export function oneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  if (values.length === 0 || values.some((v) => v.includes("'"))) {
    throw new Error("oneOf needs plain words");
  }
  return sql`${column} in (${sql.raw(values.map((v) => `'${v}'`).join(", "))})`;
}
