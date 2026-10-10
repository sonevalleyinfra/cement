import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Who changed what, for master data (retailers, vehicles, godowns, users, products).
 * Append-only: rows are never edited or deleted. Write rows with `writeAudit` (lib/audit.ts).
 * `entity` is the kind of record ("retailer", "vehicle"...), `entityId` its id as text,
 * `action` what happened ("create", "update", "activate", "deactivate", "link"),
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
  (t) => [index("audit_log_entity_idx").on(t.entity, t.entityId, t.createdAt)],
);
