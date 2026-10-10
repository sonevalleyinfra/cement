import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * One row per form that created something (a payment, an order, a dispatch...), keyed by the
 * one-time `id` the form made when it opened (`requestId`). Written in the same transaction as
 * the record it created, so a second tap or a retry with the same id finds it and creates nothing
 * (rules in lib/request-rules.ts). `resultId` is the id of what was created, when the form needs it back.
 */
export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: uuid("id").primaryKey(),
    /** Which action: "payment", "order", "dispatch"... */
    kind: text("kind").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    resultId: text("result_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("form_submissions_created_idx").on(t.createdAt)],
);
