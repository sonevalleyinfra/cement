import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * The activity log: who did what, when. One row for every state-changing action (orders,
 * dispatches, stock, payments, cash handovers, ledger, supplier accounts, masters); see lib/audit-rules.ts.
 * Append-only: rows are never edited or deleted. Write rows with `writeAudit` (lib/audit.ts).
 * Enforced by DB triggers (drizzle/0037_books_append_only.sql).
 * `entity` is the kind of record ("order", "dispatch", "payment"...), `entityId` its id as text,
 * `action` what happened (allowed pairs: AUDIT_ACTIONS in lib/audit-rules.ts),
 * `details` any extra facts (for example the fields that changed).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entity, t.entityId, t.createdAt),
    // The activity page: newest first, optionally one person.
    index("audit_log_created_idx").on(t.createdAt),
    index("audit_log_actor_idx").on(t.actorId, t.createdAt),
  ],
);
